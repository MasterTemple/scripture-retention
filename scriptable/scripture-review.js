// Scriptable: a daily notification that opens today's Scripture review.
// Run it once (and again after changing the time); the notification repeats every day.

const URL = "https://mastertemple.github.io/scripture-retention/"; // where the app is hosted
const HOUR = 7;
const MINUTE = 0;

await Notification.removePending(["scripture-retention"]);
const n = new Notification();
n.identifier = "scripture-retention";
n.title = "Scripture review";
n.body = "Say the topic, the reference, and the verse.";
n.openURL = URL;
n.setDailyTrigger(HOUR, MINUTE, true);
await n.schedule();

// Running it by hand opens the review right away
if (config.runsInApp) Safari.open(URL);
