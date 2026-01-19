import supertest from "supertest";
import { describe, it, expect } from "@jest/globals";
import { createServer } from "../server";

describe("server", () => {
  it("health check returns 200", async () => {
    const { app } = createServer();
    await supertest(app)
      .get("/health")
      .expect(200)
      .then((res) => {
        expect(res.body.status).toBe('OK');
      });
  });

  it("player search endpoint works", async () => {
    const { app } = createServer();
    await supertest(app)
      .get("/api/players/search?q=test")
      .expect(200)
      .then((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });
});
