// Server-side ceiling for any upload, whatever the max_file_size rule says. Also sizes the server-action body
// limit in next.config.ts, so this file must stay free of imports.
export const UPLOAD_HARD_LIMIT_MB = 20;
