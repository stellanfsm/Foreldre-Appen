/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /**
   * POST multipart `file` (én fil per forespørsel) + Authorization Bearer;
   * JSON body PortalImportProposalBundle. Flere filer: gjenta kall og slå sammen i klienten.
   */
  readonly VITE_TANKESTROM_ANALYZE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
