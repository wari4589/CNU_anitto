import fs from "node:fs";
import path from "node:path";
import LegacyBoot from "./legacy/LegacyBoot";

export default function Page() {
  const markup = fs.readFileSync(
    path.join(process.cwd(), "app/legacy/markup.html"),
    "utf8"
  );

  return (
    <>
      <div id="legacy-root" dangerouslySetInnerHTML={{ __html: markup }} />
      <LegacyBoot />
    </>
  );
}
