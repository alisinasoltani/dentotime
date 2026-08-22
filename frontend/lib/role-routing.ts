import type { UserRole } from "@/lib/types";

export function getRoleHomePath(
  role: UserRole,
  patientPath = "/user/",
): string {
  if (role === "DOCTOR") return "/doctor/";
  if (role === "ADMIN") return "/admin/";
  return patientPath;
}
