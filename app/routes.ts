import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  route("/", "routes/recordings.tsx", [
    index("routes/recordings._index.tsx"),
    route(":id", "routes/recordings.$id.tsx"),
  ]),
] satisfies RouteConfig;
