export interface Command {
  readonly name: string;
  readonly run: () => void;
}
