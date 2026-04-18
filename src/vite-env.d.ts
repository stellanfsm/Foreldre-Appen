/// <reference types="vite/client" />

/** TODO: remove build fingerprint after deploy verification (see vite.config.ts define) */
declare const __APP_BUILD_FINGERPRINT__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /**
   * POST multipart `file` (én fil per forespørsel) + Authorization Bearer;
   * JSON body PortalImportProposalBundle. Flere filer: gjenta kall og slå sammen i klienten.
   */
  readonly VITE_TANKESTROM_ANALYZE_URL?: string
  /** Sett til `true` for å vise midlertidig timeplan-import-debug i Tankestrøm-dialogen (også i prod-build). */
  readonly VITE_DEBUG_SCHOOL_IMPORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
