export default function RecordingsIndex() {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <div className="text-center space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground/60">
          no recording selected
        </div>
        <p className="text-[11px] text-muted-foreground/40">
          Create or select a recording from the sidebar
        </p>
      </div>
    </div>
  );
}
