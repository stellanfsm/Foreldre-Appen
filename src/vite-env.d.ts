/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** POST multipart `file` + Authorization Bearer; JSON body PortalImportProposalBundle */
  readonly VITE_TANKESTROM_ANALYZE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
