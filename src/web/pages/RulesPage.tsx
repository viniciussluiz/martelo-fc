export function RulesPage() {
  return (
    <article className="stack" style={{ gap: 22, maxWidth: 760 }}>
      <h1>Como funciona</h1>
      <section className="stack">
        <h2>O pregão</h2>
        <ol className="stack" style={{ gap: 8, paddingLeft: 22, margin: 0 }}>
          <li>Cada técnico começa com 100 moedas e escolhe a formação (4-3-3 ou 4-4-2) antes do leilão.</li>
          <li>As posições entram na ordem: goleiros, laterais, zagueiros, meio-campo e ataque. Cada lote tem uma carta a mais do que a soma das vagas da sala.</li>
          <li>Você vê nome, clube, ano e uma pista. O nível fica escondido. Escreva seus lances no envelope e lacre — dá para dar lance em tantos jogadores quantas vagas você ainda tem na posição, e o envelope não pode passar das suas moedas.</li>
          <li>Os envelopes abrem juntos, do menor para o maior pote. O maior lance leva e paga o que ofereceu. Empate no maior lance vai para um desempate às cegas; se empatar de novo, sorteio.</li>
          <li>O que ninguém comprou vai para a repescagem da posição, só para quem ainda tem vaga. O que sobrar vai para o Monte Final: cada um, na sua vez, pega de graça até fechar os 11.</li>
        </ol>
      </section>
      <section className="stack">
        <h2>Cerimônia, liga e copa</h2>
        <p>
          Na Cerimônia da Revelação aparecem as faixas de nível (por exemplo, 78–86). Em cada partida, cada jogador rende um valor dentro da sua
          faixa. A liga tem 20 times — os técnicos da sala e clubes do jogo — em turno e returno. Depois, conforme a sala, vem a Copa dos 8, a
          Taça Continental (grupos e mata-mata) ou o Torneio Mundial (jogos únicos).
        </p>
      </section>
      <section className="stack">
        <h2>Continuar na mesma sala</h2>
        <p>
          No fim do ciclo, todo mundo vê o resumo e decide se continua. Quem continua entra no próximo leilão; todos os jogadores comprados no
          ciclo anterior voltam ao pregão, e as moedas voltam a 100. Quem não responder no prazo fica fora desta rodada e pode voltar depois
          pelo código. Se poucos técnicos confirmarem, a sala volta para a espera com o histórico intacto.
        </p>
      </section>
      <section className="stack">
        <h2>Confrontos</h2>
        <p>Os números contra cada adversário são separados por modalidade e nunca somados entre si:</p>
        <ul className="stack" style={{ gap: 6, paddingLeft: 22, margin: 0 }}>
          <li>Ciclos: cada disputa completa em comum; vence quem termina melhor no ranking do ciclo (títulos e, depois, posição na liga).</li>
          <li>Ligas: quem ficou acima na tabela.</li>
          <li>Copas: quem foi mais longe quando os dois jogaram; mesma fase conta como empate.</li>
          <li>Partidas: cada jogo direto entre os dois times, pelo placar.</li>
          <li>Mata-matas: cada eliminatória da copa entre os dois.</li>
          <li>Disputas de lance: cartas em que os dois deram lance e um deles levou.</li>
        </ul>
        <p className="small muted">Só contam disputas concluídas. Quem sai da sala no meio da disputa fica fora dos confrontos e conquistas daquele ciclo.</p>
      </section>
    </article>
  );
}
