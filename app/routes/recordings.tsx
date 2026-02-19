import { Settings } from "lucide-react";
import { useEffect } from "react";
import { Outlet, redirect } from "react-router";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { OBSSetupModal } from "@/features/recording/components/OBSSetupModal";
import { RecordingHistory } from "@/features/recording/components/RecordingHistory";
import {
  getAllRecordings,
  createRecording,
  deleteRecording,
} from "@/features/recording/db";
import {
  useOBSRecording,
  type OBSRecordingState,
} from "@/features/recording/hooks/use-obs-recording";
import { useGlobalSettings } from "@/hooks/use-global-settings";

import type { Route } from "./+types/recordings";

export interface RecordingsOutletContext {
  // refreshRecordings: () => Promise<void>;
  obsRecording: {
    state: OBSRecordingState;
    startRecording: () => Promise<void>;
    stopRecording: () => Promise<void>;
    reconnect: () => Promise<void>;
  };
}

export const clientLoader = async () => {
  const recordings = await getAllRecordings();
  return { recordings };
};

export const clientAction = async ({ request }: Route.ClientActionArgs) => {
  const formData = await request.formData();
  const action = formData.get("action");
  switch (action) {
    case "createRecording": {
      const name = formData.get("name") as string;
      const id = crypto.randomUUID();
      await createRecording({ id, name });
      throw redirect(`/${id}`);
    }

    case "deleteRecording": {
      const recordingId = formData.get("id") as string;
      await deleteRecording(recordingId);
      throw redirect("/");
    }
    default: {
      throw new Error(`Unknown action: ${action}`);
    }
  }
};

export default function RecordingsLayout({ loaderData }: Route.ComponentProps) {
  // const navigate = useNavigate();
  const { recordings } = loaderData;
  const { settings, setSilenceThreshold } = useGlobalSettings();
  const obsRecording = useOBSRecording();

  // const handleCreate = useCallback(
  //   async (name: string) => {
  //     const id = crypto.randomUUID();
  //     await createRecording({ id, name });
  //     await loadRecordings();
  //     navigate(`/${id}`);
  //   },
  //   [loadRecordings, navigate]
  // );

  // const handleDelete = useCallback(
  //   async (id: string) => {
  //     await deleteRecording(id);
  //     await loadRecordings();
  //     navigate("/recordings");
  //   },
  //   [loadRecordings, navigate]
  // );

  const { connected, virtualCameraActive } =
    obsRecording.state.connectionStatus;
  const isReady = connected && virtualCameraActive;

  // Auto-retry OBS connection when disconnected
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => {
      obsRecording.reconnect();
    }, 3000);
    return () => clearInterval(id);
  }, [connected, obsRecording.reconnect]);

  return (
    <div className="h-screen flex">
      <div className="w-56 border-r border-border flex flex-col shrink-0 bg-sidebar">
        <RecordingHistory recordings={recordings} />

        {/* Global settings */}
        <div className="mt-auto border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-default outline-none">
              <Settings className="h-3 w-3" />
              Settings
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" sideOffset={4} className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Silence Detection</DropdownMenuLabel>
                <div className="px-2 pt-2 pb-3 space-y-2">
                  <Slider
                    min={-60}
                    max={-30}
                    step={1}
                    value={settings.silenceThreshold}
                    onValueChange={(value) =>
                      setSilenceThreshold(
                        Array.isArray(value) ? (value[0] ?? 0) : value
                      )
                    }
                  />
                  <p className="text-[9px] text-muted-foreground">
                    {settings.silenceThreshold}dB
                  </p>
                </div>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet
          context={
            {
              // refreshRecordings: loadRecordings,
              obsRecording,
            } satisfies RecordingsOutletContext
          }
        />
      </div>

      <OBSSetupModal
        open={!isReady}
        isConnected={connected}
        isVirtualCameraActive={virtualCameraActive}
        onDismiss={obsRecording.reconnect}
      />
    </div>
  );
}
