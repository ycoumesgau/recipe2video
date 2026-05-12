/**
 * Paquets RPM pour **Chrome Headless Shell** sur Amazon Linux 2023 (image Vercel
 * Sandbox). Sans eux, `headless_shell` échoue au démarrage (ex. `libnspr4.so`
 * introuvable).
 *
 * @see https://www.remotion.dev/docs/miscellaneous/linux-dependencies#amazon-linux-2023
 */
export const REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES: readonly string[] = [
  "alsa-lib",
  "atk",
  "at-spi2-atk",
  "at-spi2-core",
  "cairo",
  "cups-libs",
  "dbus",
  "dbus-libs",
  "libdrm",
  "libX11",
  "libXcomposite",
  "libXdamage",
  "libXfixes",
  "libXrandr",
  "libxkbcommon",
  "mesa-libgbm",
  "nspr",
  "nss",
  "pango",
];
