import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No page cache: every request renders in the Worker. The free KV plan's 1,000 writes/day could not hold one.
export default defineCloudflareConfig();
