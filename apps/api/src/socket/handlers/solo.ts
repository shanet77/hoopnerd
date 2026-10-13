import { Socket } from "socket.io";
import type {
  CreateSoloRunRequest,
  EndSoloRunRequest,
  ResumeSoloRunRequest,
  SubmitSoloMoveRequest,
} from "@repo/types";
import type { SoloEngine } from "../../services/SoloEngine";
import { issueSoloToken, verifySoloToken } from "../../socketAuth";
import { requirePlayerName, respondWithError } from "../socketProtocol";
import { AuthError, AuthErrorCode } from "../SessionAuthorizer";

const USER_ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

const requireSoloClaims = (token: unknown, eventRunId: string) => {
  if (typeof token !== "string" || !token) {
    throw new AuthError(AuthErrorCode.INVALID_TOKEN, "Run token required");
  }
  const claims = verifySoloToken(token);
  if (!claims) {
    throw new AuthError(AuthErrorCode.INVALID_TOKEN, "Invalid run token");
  }
  if (claims.runId !== eventRunId) {
    throw new AuthError(
      AuthErrorCode.ROOM_MISMATCH,
      "Run token does not belong to this run",
    );
  }
  return claims;
};

export function registerSoloGameHandlers(
  socket: Socket,
  soloEngine: SoloEngine,
): void {
  socket.on("create_solo_run", async (data: CreateSoloRunRequest) => {
    let displayName: string;
    try {
      displayName = requirePlayerName(data?.displayName);
    } catch (error) {
      respondWithError(socket, error);
      socket.emit("solo_run_created", {
        success: false,
        message: error instanceof Error ? error.message : "Invalid request.",
      });
      return;
    }

    const userId = typeof data?.userId === "string" ? data.userId.trim() : "";
    if (!USER_ID_PATTERN.test(userId)) {
      socket.emit("solo_run_created", {
        success: false,
        message: "A valid user id is required to start a solo run.",
      });
      return;
    }

    try {
      const run = await soloEngine.create(
        userId,
        displayName,
        data.seasonYearMin,
        data.seasonYearMax,
      );
      if (!run) {
        socket.emit("solo_run_created", {
          success: false,
          message: "No players available to start a run.",
        });
        return;
      }

      socket.join(run.roomId);
      socket.emit("solo_run_created", {
        success: true,
        message: "Solo run created!",
        runState: run,
        runToken: issueSoloToken(run.roomId, userId),
      });
    } catch (err) {
      console.error("Error creating solo run:", err);
      socket.emit("solo_run_created", {
        success: false,
        message: "Internal error creating solo run.",
      });
    }
  });

  socket.on("resume_solo_run", async (data: ResumeSoloRunRequest) => {
    let claims;
    try {
      claims = requireSoloClaims(data?.runToken, data?.runId);
    } catch (error) {
      respondWithError(socket, error);
      socket.emit("solo_run_resumed", {
        success: false,
        message: error instanceof Error ? error.message : "Invalid request.",
      });
      return;
    }

    const run = soloEngine.resumeRun(claims.runId);
    if (!run) {
      socket.emit("solo_run_resumed", {
        success: false,
        message: "Run expired — start a new one.",
      });
      return;
    }

    socket.join(run.roomId);
    socket.emit("solo_run_resumed", {
      success: true,
      message: "Run resumed!",
      runState: run,
    });
  });

  socket.on("submit_solo_move", async (data: SubmitSoloMoveRequest) => {
    let claims;
    try {
      claims = requireSoloClaims(data?.runToken, data?.runId);
    } catch (error) {
      respondWithError(socket, error);
      return;
    }

    try {
      const outcome = await soloEngine.submitMove(
        claims.runId,
        claims.userId,
        data.connectedPlayer,
      );
      socket.emit("solo_move_result", outcome);
    } catch (err) {
      console.error("Error submitting solo move:", err);
      socket.emit("solo_move_result", {
        success: false,
        message: "Error validating move",
      });
    }
  });

  socket.on("end_solo_run", async (data: EndSoloRunRequest) => {
    let claims;
    try {
      claims = requireSoloClaims(data?.runToken, data?.runId);
    } catch (error) {
      respondWithError(socket, error);
      return;
    }

    try {
      const outcome = await soloEngine.endRun(claims.runId, claims.userId);
      socket.emit("solo_run_ended", outcome);
    } catch (err) {
      console.error("Error ending solo run:", err);
      socket.emit("solo_run_ended", {
        success: false,
        message: "Error ending run",
        streak: 0,
      });
    }
  });
}
