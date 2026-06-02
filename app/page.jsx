import fs from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import LegacyBoot from "./legacy/LegacyBoot";

export default async function Page() {
  await connection();

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
