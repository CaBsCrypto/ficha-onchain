/**
 * Minimal type shim for the `qrcode` npm package (no @types/qrcode available).
 * Covers the subset of the API used in this project.
 */
declare module "qrcode" {
  interface QRCodeToDataURLOptions {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
    type?: string;
  }

  function toDataURL(
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<string>;
  function toDataURL(
    text: string,
    callback: (err: Error | null | undefined, url: string) => void
  ): void;
  function toDataURL(
    text: string,
    options: QRCodeToDataURLOptions,
    callback: (err: Error | null | undefined, url: string) => void
  ): void;

  function toString(
    text: string,
    options?: QRCodeToDataURLOptions
  ): Promise<string>;

  export { toDataURL, toString };
  export default { toDataURL, toString };
}
