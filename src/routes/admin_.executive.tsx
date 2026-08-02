import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "./admin";

export const Route = createFileRoute("/admin_/executive")({
  component: () => <AdminPage initialTab="executiva" />,
});
