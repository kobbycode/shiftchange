export interface SystemSettings {
  smtpServer: string;
  sessionTimeout: number; // minutes idle before auto sign-out (0 = disabled)
  allowPinSignature: boolean;
  emailAlerts: boolean;
}

const KEY = "shift_system_settings";

export const DEFAULT_SETTINGS: SystemSettings = {
  smtpServer: "smtp.broadcast-noc.net",
  sessionTimeout: 60,
  allowPinSignature: true,
  emailAlerts: true,
};

export function getSystemSettings(): SystemSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        sessionTimeout: Number(parsed.sessionTimeout) || DEFAULT_SETTINGS.sessionTimeout,
      };
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveSystemSettings(settings: SystemSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}
