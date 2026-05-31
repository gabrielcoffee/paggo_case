// Load .env so APP_TODAY and DATABASE_URL are available to the scoring logic
// and the integration tests (same vars the app and Prisma CLI use).
import "dotenv/config";
