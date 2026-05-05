export interface OpenedFile {
  path: string;
  contents: string;
}

export interface StorageAdapter {
  /**
   * Show a file picker; resolve to the chosen file's contents and absolute path,
   * or null if the user cancels.
   */
  open(): Promise<OpenedFile | null>;

  /**
   * Read a file at a known path (used for opening from "Recent" or watcher reload).
   */
  read(path: string): Promise<string>;

  /**
   * Write the given contents to the given path.
   */
  save(path: string, contents: string): Promise<void>;

  /**
   * Show a save-as dialog; resolve to the chosen path, or null if cancelled.
   */
  pickSavePath(suggested?: string): Promise<string | null>;

  /**
   * Watch a file for external modifications. Returns a function to stop watching.
   * onChange fires for any modification event.
   */
  watch(path: string, onChange: () => void): Promise<() => void>;
}
