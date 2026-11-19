import type { ReactNode } from 'react';
import { SectionTitle } from '../components/ui';
import { navigate } from '../lib/router';

function Go({ to, children, button }: { to: string; children: ReactNode; button?: boolean }) {
  return (
    <a
      className={button ? 'btn btn-primary' : undefined}
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/** Guia para quem nunca jogou: o que é o jogo e o caminho da primeira partida até o troféu. */
export function HowToPlayPage() {
  return (
    <article className="rules info-page">
      <header className="rules-head">
        <h1>Como jogar o Leilão FC</h1>
        <p>
          O Leilão FC é um jogo de futebol gratuito, direto no navegador: você compra jogadores num leilão às cegas, monta um time de 11 e disputa
          uma liga e uma copa contra os amigos ou contra a CPU.
        </p>
      </header>

      <section className="rules-block">
        <SectionTitle>Em uma frase</SectionTitle>
        <p>
          Todo mundo começa com 100 moedas e vê só o nome, o clube e o ano de cada jogador. Quanto ele vale em campo você só descobre depois de
          pagar. Ganha quem souber em quem apostar e quanto guardar para o resto do time.
        </p>
      </section>

      <section className="rules-block">
        <SectionTitle>Começando</SectionTitle>
        <ul className="info-list">
          <li>
            <strong>Single player:</strong> você contra times do computador. É o melhor jeito de aprender, sem ninguém esperando.
          </li>
          <li>
            <strong>Sala com amigos:</strong> crie uma sala, mande o link ou o código e esperem todo mundo entrar. Quem criou a sala escolhe o modo
            de leilão, o ritmo e a copa do fim da temporada.
          </li>
          <li>
            <strong>Conta ou convidado:</strong> dá para jogar sem cadastro, só com o nome do time. Criando a conta com e-mail e senha, o time, os
            troféus e o histórico acompanham você em qualquer aparelho.
          </li>
        </ul>
      </section>

      <section className="rules-block">
        <SectionTitle>O leilão</SectionTitle>
        <p>
          Antes de começar, cada técnico escolhe a formação: 4-3-3 ou 4-4-2. As posições vão a leilão em ordem: goleiros, laterais, zagueiros,
          meio-campo e ataque.
        </p>
        <p>
          Em cada lote você escreve os lances num envelope e lacra. Ninguém vê o lance de ninguém. Quando todos lacram, os envelopes abrem juntos:
          o maior lance leva o jogador e paga o que ofereceu. Empate no maior lance vai para um desempate às cegas e, se empatar de novo, para o
          sorteio.
        </p>
        <p>
          Quem não foi comprado volta numa repescagem, só para quem ainda tem vaga. O que sobrar vai para o Monte Final, onde cada técnico, na sua
          vez, pega jogadores de graça até fechar os 11. Gastar tudo cedo deixa você dependendo do Monte.
        </p>
      </section>

      <section className="rules-block">
        <SectionTitle>Três modos de leilão</SectionTitle>
        <ul className="info-list">
          <li>
            <strong>Jogadores:</strong> o clássico, um jogador por lance.
          </li>
          <li>
            <strong>Clubes:</strong> cada lote é um setor inteiro de um clube, como a zaga do Bayern ou o ataque do Santos. Quem leva o pacote escolhe
            depois quais jogadores dele entram no time.
          </li>
          <li>
            <strong>Seleções:</strong> igual ao de clubes, mas com os maiores nomes que vestiram a camisa de cada seleção.
          </li>
        </ul>
        <p>O baralho mistura épocas: craques de hoje dividem o pregão com lendas de décadas passadas, de clubes do Brasil e da Europa.</p>
      </section>

      <section className="rules-block">
        <SectionTitle>A cerimônia</SectionTitle>
        <p>
          Com os times fechados, as faixas de nível aparecem (por exemplo, 78–86) e todo mundo descobre quem comprou craque e quem comprou furada.
          Em cada partida, o jogador rende um valor dentro da faixa dele.
        </p>
        <p>
          É também a hora de escolher o capitão e quem bate pênalti, falta e escanteio. O batedor de pênalti é quem abre a série do seu time se um
          mata-mata for para a disputa de pênaltis.
        </p>
      </section>

      <section className="rules-block">
        <SectionTitle>A temporada</SectionTitle>
        <p>
          A liga tem 20 times, com os técnicos da sala e clubes do jogo, em turno e returno. O seu jogo passa num campinho, com a bola de pé em pé,
          faltas, escanteios, pênaltis e, de vez em quando, uma expulsão. Antes de cada rodada dá para trocar a tática entre retranca, equilíbrio e
          ataque.
        </p>
        <p>
          Quando a liga termina, a sala festeja o campeão e começa a copa escolhida: a Copa dos 8, a Libertadores (com grupos e mata-mata) ou o
          Torneio Mundial. Mata-mata empatado vai para os pênaltis, cobrança por cobrança.
        </p>
      </section>

      <section className="rules-block">
        <SectionTitle>Depois do apito final</SectionTitle>
        <p>
          O resumo mostra os campeões, e a sala decide se joga outro ciclo: as moedas voltam a 100 e todos os jogadores voltam ao pregão. O jogo
          guarda o histórico de confrontos entre os técnicos, então na próxima vez que você enfrentar um amigo a tela mostra quem leva vantagem.
          Troféus e conquistas ficam no seu perfil.
        </p>
      </section>

      <section className="rules-block">
        <SectionTitle>Dicas para a primeira partida</SectionTitle>
        <ul className="info-list">
          <li>Não gaste metade das moedas no primeiro goleiro: ainda faltam dez vagas.</li>
          <li>Nome famoso não garante nível alto. O ano da carta importa: o mesmo jogador rende diferente no auge e no fim da carreira.</li>
          <li>Lance em mais de um jogador por lote quando tiver mais de uma vaga na posição; o envelope só não pode passar das suas moedas.</li>
          <li>Guarde algumas moedas para o ataque, que é o último setor e costuma ter os nomes mais disputados.</li>
        </ul>
        <p>
          Quer os detalhes de desempate, repescagem e confrontos? Estão nas <Go to="/regras">regras completas</Go>.
        </p>
        <p>
          <Go to="/" button>
            Jogar agora
          </Go>
        </p>
      </section>
    </article>
  );
}
