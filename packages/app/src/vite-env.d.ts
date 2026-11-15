/// <reference types="vite/client" />
/// <reference types="@iwsdk/vite-plugin-dev/client" />

interface ImportMetaEnv {
  /** Coach proxy endpoint (packages/proxy). Empty: the voice coach shows "Setup required". */
  readonly VITE_MEBAE_COACH_URL?: string;
}
