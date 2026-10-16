import app from "./app.js";
import { startJobs } from "./jobs.js";

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
if (process.env.NODE_ENV !== "test") startJobs();
