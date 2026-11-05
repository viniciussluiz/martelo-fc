import { EnvelopeArt } from '../components/common';
import { Icon } from '../components/Icon';
import { PixelCoin, PosChip, SectionTitle } from '../components/ui';

/** Manual do jogo: o pregão em passos, depois cerimônia, campeonatos, continuidade e confrontos. */
export function RulesPage() {
  return (
    <article className="rules">
      <header className="rules-head">
        <h1>Como funciona</h1>
        <p>Um leilão às cegas, um time de 11 e uma temporada inteira para provar que você sabe comprar.</p>
      </header>

      <section className="rules-block">
        <SectionTitle>O pregão</SectionTitle>
        <ol className="rules-steps">
          <li>
            <span className="rules-art">
              <PixelCoin size={34} />
            </span>
            <p>Cada técnico começa com 100 moedas e escolhe a formação (4-3-3 ou 4-4-2) antes do leilão.</p>
          </li>
          <li>
            <span className="rules-art rules-pos">
              <PosChip pos="GOL" />
              <PosChip pos="LAT" />
              <PosChip pos="ZAG" />
              <PosChip pos="MEI" />
              <PosChip pos="ATA" />
            </span>
            <p>
              As posições entram na ordem: goleiros, laterais, zagueiros, meio-campo e ataque. Cada lote tem uma carta a mais do que a soma das
              vagas da sala.
            </p>
          </li>
          <li>
            <span className="rules-art">
              <EnvelopeArt amount="12" sealed />
            </span>
            <p>
              Você vê nome, clube e ano. O nível fica escondido. Escreva seus lances no envelope e lacre — dá para dar lance em tantos jogadores
              quantas vagas você ainda tem na posição, e o envelope não pode passar das suas moedas.
            </p>
          </li>
          <li>
            <span className="rules-art">
              <Icon name="martelo" size={38} />
            </span>
            <p>
              Os envelopes abrem juntos, do menor para o maior pote. O maior lance leva e paga o que ofereceu. Empate no maior lance vai para um
              desempate às cegas; se empatar de novo, sorteio.
            </p>
          </li>
          <li>
            <span className="rules-art">
              <Icon name="monte" size={38} />
            </span>
            <p>
              O que ninguém comprou vai para a repescagem da posição, só para quem ainda tem vaga. O que sobrar vai para o Monte Final: cada um,
              na sua vez, pega de graça até fechar os 11.
            </p>
          </li>
        </ol>
      </section>

      <div className="rules-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Cerimônia, liga e copa</h2>
          </div>
          <div className="panel-body">
            <p>
              Na Cerimônia da Revelação aparecem as faixas de nível (por exemplo, 78–86). Em cada partida, cada jogador rende um valor dentro da
              sua faixa. A liga tem 20 times — os técnicos da sala e clubes do jogo — em turno e returno. Depois, conforme a sala, vem a Copa dos
              8, a Taça Continental (grupos e mata-mata) ou o Torneio Mundial (jogos únicos).
            </p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Continuar na mesma sala</h2>
          </div>
          <div className="panel-body">
            <p>
              No fim do ciclo, todo mundo vê o resumo e decide se continua. Quem continua entra no próximo leilão; todos os jogadores comprados
              no ciclo anterior voltam ao pregão, e as moedas voltam a 100. Quem não responder no prazo fica fora desta rodada e pode voltar
              depois pelo código. Se poucos técnicos confirmarem, a sala volta para a espera com o histórico intacto.
            </p>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Confrontos</h2>
        </div>
        <div className="panel-body stack">
          <p>Os números contra cada adversário são separados por modalidade e nunca somados entre si:</p>
          <ul className="rules-list">
            <li>
              <strong>Ciclos:</strong> cada disputa completa em comum; vence quem termina melhor no ranking do ciclo (títulos e, depois, posição
              na liga).
            </li>
            <li>
              <strong>Ligas:</strong> quem ficou acima na tabela.
            </li>
            <li>
              <strong>Copas:</strong> quem foi mais longe quando os dois jogaram; mesma fase conta como empate.
            </li>
            <li>
              <strong>Partidas:</strong> cada jogo direto entre os dois times, pelo placar.
            </li>
            <li>
              <strong>Mata-matas:</strong> cada eliminatória da copa entre os dois.
            </li>
            <li>
              <strong>Disputas de lance:</strong> cartas em que os dois deram lance e um deles levou.
            </li>
          </ul>
          <p className="hint">Só contam disputas concluídas. Quem sai da sala no meio da disputa fica fora dos confrontos e conquistas daquele ciclo.</p>
        </div>
      </section>
    </article>
  );
}
