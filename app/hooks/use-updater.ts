import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect, useRef, useState } from "react";

import { useToast } from "./use-toast";

export function useUpdater() {
  const toast = useToast();
  const checkedRef = useRef(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    check()
      .then(async (update) => {
        if (!update) return;

        toast.add({
          title: `Update ${update.version} available`,
          description: "Downloading...",
          type: "info",
        });

        setUpdating(true);
        await update.downloadAndInstall();
        setUpdating(false);

        toast.add({
          title: "Update installed",
          description: "Restarting...",
          type: "success",
        });

        await relaunch();
      })
      .catch((error) => {
        console.error("Update check failed:", error);
      });
  }, []);

  return { updating };
}
