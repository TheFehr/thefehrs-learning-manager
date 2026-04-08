export interface BaseMessage<TKey extends string, TData extends object | null> {
  type: TKey;
  data: TData;
}

/**
 * A simple signal requiring no payload.
 * Each client will independently check its own settings and actors.
 */
export type TimeGrantedMessage = BaseMessage<"timeGrantedSignal", null>;

export type LearningModuleMessage = TimeGrantedMessage;
