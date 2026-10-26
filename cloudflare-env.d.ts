declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET?: R2Bucket;
    CONNECTORS?: any;
    MODEL_API_KEY?: string;
    MODEL_NAME?: string;
    MODEL_PROVIDER?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    FUYAO_API_KEY?: string;
    DATA_RELAY_URL?: string;
    DATA_RELAY_TOKEN?: string;
    SCHEDULER_SECRET?: string;
    PRIVATE_SERVICE_UPDATES?: string;
  }
}
