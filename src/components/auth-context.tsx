"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { db } from "@/lib/firestore";
import { User, UserRole } from "@/lib/mock-db";
import toast from "react-hot-toast";


interface AuthContextType {
  user: User | null;
  businessId: string | null;
  loading: boolean;
  login: (email: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkPermission: (requiredRole: UserRole) => boolean;
  hasRole: (role: UserRole) => boolean;
  // Explicit technician check-in (dashboard button) — attendance is never
  // recorded automatically, only when the user confirms they are on duty
  recordCheckIn: (userId: string) => Promise<boolean>;
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined);

// Role hierarchy: Admin > Supervisor > Technician
const roleWeight: Record<UserRole, number> = {
  Admin: 3,
  Supervisor: 2,
  Technician: 1,
};

// Routes accessible without a logged-in user
const PUBLIC_PATHS = [
  "/login",
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [businessId, setBusinessId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // ── Explicit technician check-in ───────────────────────────────
  // Runs ONLY on user confirmation (login "Start Shift" choice or the
  // dashboard Check In button). In-flight guard: overlapping triggers (login
  // opt-in + button) would both see "no check-in yet" and each create a
  // duplicate attendance row.
  let autoStartShiftLock = React.useRef(false);
  const autoStartShift = React.useCallback(async (userId: string): Promise<boolean> => {
    if (autoStartShiftLock.current) return false;
    autoStartShiftLock.current = true;
    try {
      return await db.shifts.recordCheckIn(userId);
    } catch (err) {
      console.error("Shift attendance log failed:", err);
      return false;
    } finally {
      autoStartShiftLock.current = false;
    }
  }, []);

  // ── Session initialisation ────────────────────────────────────
  React.useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const localUser = db.auth.getUser();
        if (mounted) {
          setUser(localUser);
          setBusinessId(localUser?.business_id ?? null);
          setLoading(false);
          // Attendance is recorded ONLY when the technician chose "Start Shift"
          // at login (login page sets shift_checkin_optin=1). Consume the flag
          // once, then clear it — later reloads while browsing must never
          // record attendance.
          if (localUser && typeof window !== "undefined" && localStorage.getItem("shift_checkin_optin") === "1") {
            localStorage.removeItem("shift_checkin_optin");
            autoStartShift(localUser.id).then((created) => {
              if (created && mounted && typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("shift_data_changed"));
              }
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
        if (mounted) setLoading(false);
      }
    };

    initAuth();
    return () => { mounted = false };
  }, [autoStartShift]);

  // ── Route guard ───────────────────────────────────────────────
  React.useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (!user && !isPublic) {
      router.replace("/login");
    } else if (user && isPublic) {
      router.replace("/");
    }
  }, [user, loading, pathname, router]);

  // ── Login (legacy PIN — for shift handover identity) ──────────
  const login = async (email: string, pin: string): Promise<boolean> => {
    setLoading(true);
    const { user: authenticated, error } = await db.auth.signIn(email, pin);
    if (error) { setLoading(false); toast.error(error); return false; }
    if (authenticated) {
      setUser(authenticated);
      setBusinessId(authenticated.business_id ?? null);
      setLoading(false);
      toast.success(`Welcome back, ${authenticated.name}!`);
      router.replace("/");
      return true;
    }
    setLoading(false);
    return false;
  };

  // ── Logout ────────────────────────────────────────────────────
  const logout = async () => {
    setLoading(true);
    await db.auth.signOut();
    setUser(null);
    setBusinessId(null);
    setLoading(false);
    toast.success("Logged out successfully");
    router.replace("/login");
  };

  // ── Permission helpers ────────────────────────────────────────
  const checkPermission = (requiredRole: UserRole): boolean => {
    if (!user) return false;
    return roleWeight[user.role] >= roleWeight[requiredRole];
  };

  const hasRole = (role: UserRole): boolean => user?.role === role;

  return (
    <AuthContext.Provider
      value={{ user, businessId, loading, login, logout, checkPermission, hasRole, recordCheckIn: autoStartShift }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
