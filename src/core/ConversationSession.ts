import { ConversationSessionConfig } from "../types";

export class ConversationSession {
  public id: string;
  public createdAt: number;
  public lastModifiedAt: number;
  public sessionName: string;

  constructor(config: ConversationSessionConfig) {
    this.id = config.id;
    this.createdAt = config.createdAt;
    this.lastModifiedAt = config.lastModifiedAt;
    this.sessionName = config.sessionName;
  }

  rename() {}

  clone(id: string, name: string): ConversationSession {
    return new ConversationSession({
      id,
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
      sessionName: name || this.sessionName + " (Clone)",
    });
  }
}
