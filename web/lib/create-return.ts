export const CREATE_RETURN_KEY = "ovrflo:create-return";
export const CREATE_CHOOSER_PATH = "/create/";
export const HOME_PATH = "/";

export function rememberCreateReturn(path: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(CREATE_RETURN_KEY, path);
}

export function readCreateReturn(): string {
  if (typeof sessionStorage === "undefined") return HOME_PATH;
  const stored = sessionStorage.getItem(CREATE_RETURN_KEY);
  if (stored === CREATE_CHOOSER_PATH || stored === "/create") return CREATE_CHOOSER_PATH;
  return HOME_PATH;
}

export function createReturnLabel(path: string): string {
  return path === CREATE_CHOOSER_PATH ? "Choose an OVRFLO" : "Your OVRFLO";
}
