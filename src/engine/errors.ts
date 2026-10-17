/** Erro de regra de jogo — mensagem pensada para ser exibida ao jogador. */
export class GameRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameRuleError';
  }
}
