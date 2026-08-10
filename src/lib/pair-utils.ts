export interface PairTeam<T = any> {
  pairName: string;
  formattedName: string;
  users: T[];
  roles: string;
}

const AVATAR_COLORS = [
  { bg: "bg-blue-600 dark:bg-blue-500", text: "text-white" },
  { bg: "bg-emerald-600 dark:bg-emerald-500", text: "text-white" },
  { bg: "bg-amber-600 dark:bg-amber-500", text: "text-white" },
  { bg: "bg-purple-600 dark:bg-purple-500", text: "text-white" },
  { bg: "bg-rose-600 dark:bg-rose-500", text: "text-white" },
];

export function getAvatarColorClass(index: number) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

export function formatPairName(rawNameOrUser: any): string {
  if (!rawNameOrUser) return "Unassigned";
  if (typeof rawNameOrUser === "object") {
    return rawNameOrUser.name || "Unassigned";
  }
  return String(rawNameOrUser);
}

export function getPairNamesList(rawNameOrUser: any): string[] {
  const name = formatPairName(rawNameOrUser);
  return [name];
}

export function getPairInitials(rawNameOrUser: any): string[] {
  const names = getPairNamesList(rawNameOrUser);
  if (names.length === 0) return ["?"];
  return names.map((n) => n.charAt(0).toUpperCase());
}

// One "team" per assignable staff member (excludes Admins) — used to build
// the assignee dropdowns in the fault/task forms. Despite the historical
// "pair" naming, there is no forced pairing: each staff member is their own
// selectable team.
export function getAssignableStaffTeams<T extends { id: string; name: string; role: string; email: string; pin: string }>(users: T[]): PairTeam<T>[] {
  const nonAdmin = users.filter(u => u.role !== "Admin");
  return nonAdmin.map((user) => ({
    pairName: user.name,
    formattedName: user.name,
    users: [user],
    roles: user.role,
  }));
}
