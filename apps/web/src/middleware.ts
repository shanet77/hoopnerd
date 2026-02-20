import { NextResponse, type NextRequest } from "next/server";

const GRAPH_HOST = "graph.hoopnerd.xyz";

export function middleware(request: NextRequest) {
  const hostHeader = request.headers.get("host")?.toLowerCase();
  const host = hostHeader ? hostHeader.split(":")[0] : undefined;

  if (host !== GRAPH_HOST) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname !== "/") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/graph";
  return NextResponse.rewrite(url);
}
