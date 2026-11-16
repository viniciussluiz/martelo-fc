import type { ReactNode } from 'react';
import { SectionTitle } from '../components/ui';
import { navigate } from '../lib/router';

const CONTACT = 'leilaofc.oficial@gmail.com';
const UPDATED = '16 de novembro de 2026';

function Go({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
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

function Mail() {
  return <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
}

export function AboutPage() {
  return (
    <article className="rules info-page">
      <header className="rules-head">
        <h1>Sobre o Leilão FC</h1>
        <p>Um jogo de navegador para quem gosta de futebol e de discutir quem montaria o melhor time.</p>
      </header>
      <section className="rules-block">
        <SectionTitle>O que é</SectionTitle>
        <p>
          O Leilão FC é um leilão às cegas de jogadores de futebol. Cada técnico recebe 100 moedas, dá lances fechados nos jogadores (ou em setores
          inteiros de clubes e seleções) e monta um time de 11. Depois do pregão, os times disputam uma liga de pontos corridos e uma copa, com as
          partidas passando na tela lance a lance.
        </p>
        <p>
          Dá para jogar sozinho contra a CPU, em partida rápida, ou abrir uma sala e chamar os amigos pelo link. O jogo guarda o histórico de confrontos
          entre os técnicos, os troféus e as conquistas de cada um. As regras completas estão em <Go to="/regras">Como funciona</Go>.
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>O baralho</SectionTitle>
        <p>
          As cartas reúnem jogadores de clubes das Séries A e B do Brasil, de grandes clubes da Europa e de seleções, de várias épocas. Os dados de
          carreira (clubes, anos, jogos e gols) vêm do Wikidata, uma base aberta sob licença CC0; as notas de cada carta são calculadas pelo próprio
          Leilão FC e não representam avaliação oficial de ninguém.
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>Quem faz</SectionTitle>
        <p>
          O Leilão FC é um projeto independente, criado e mantido por Vinicius Luiz Alves de Oliveira, desenvolvedor brasileiro, com a ajuda de quem
          joga. Sugestões, correções de
          jogadores e relatos de erro são bem-vindos pela página de <Go to="/contato">Contato</Go>.
        </p>
        <p className="small muted">
          O Leilão FC não tem vínculo com clubes, federações, ligas ou atletas. Nomes e escudos aparecem apenas para identificar os times e os
          jogadores dentro do jogo e pertencem aos seus respectivos titulares.
        </p>
      </section>
    </article>
  );
}

export function ContactPage() {
  return (
    <article className="rules info-page">
      <header className="rules-head">
        <h1>Contato</h1>
        <p>Fale com quem cuida do Leilão FC.</p>
      </header>
      <section className="rules-block">
        <SectionTitle>E-mail</SectionTitle>
        <p>
          Escreva para <Mail />. É por esse endereço que respondemos dúvidas, sugestões, correções de jogadores e de escudos, relatos de erro e pedidos
          sobre a sua conta e os seus dados.
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>Para a resposta sair mais rápido</SectionTitle>
        <ul className="info-list">
          <li>Erro no jogo: diga o que você estava fazendo, o código da sala (aparece no endereço) e, se puder, mande uma imagem da tela.</li>
          <li>Jogador faltando ou com dado errado: informe o nome, o clube e a época.</li>
          <li>Conta: escreva do mesmo e-mail cadastrado nela. Nunca pedimos a sua senha.</li>
          <li>Direitos de imagem ou de marca: indique o conteúdo e o que precisa ser ajustado ou retirado.</li>
        </ul>
      </section>
    </article>
  );
}

export function PrivacyPage() {
  return (
    <article className="rules info-page">
      <header className="rules-head">
        <h1>Política de Privacidade</h1>
        <p>O que o Leilão FC guarda sobre você, para quê e como pedir para ver, corrigir ou apagar. Atualizada em {UPDATED}.</p>
      </header>
      <section className="rules-block">
        <SectionTitle>Quem é o responsável</SectionTitle>
        <p>
          O Leilão FC (leilaofc.com.br) é mantido por Vinicius Luiz Alves de Oliveira, desenvolvedor independente, no Brasil. Ele é o responsável pelos
          dados tratados no site. Para qualquer assunto desta política, escreva para{' '}
          <Mail />.
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>O que guardamos</SectionTitle>
        <ul className="info-list">
          <li>
            <strong>Conta:</strong> o e-mail, o nome e o escudo do seu time e a senha, guardada de forma embaralhada (nem nós conseguimos ler). Quem
            joga como convidado não informa e-mail: fica só o nome do time.
          </li>
          <li>
            <strong>Jogo:</strong> as salas em que você entrou, os lances, os resultados, os confrontos com outros técnicos, os troféus e as conquistas.
          </li>
          <li>
            <strong>Acesso:</strong> o endereço IP e a hora dos pedidos, usados para proteger o site contra abuso (por exemplo, limitar tentativas de
            senha) e para investigar erros.
          </li>
          <li>
            <strong>No seu aparelho:</strong> um código de sessão, que mantém você conectado, e a sua escolha sobre cookies.
          </li>
        </ul>
        <p>Não pedimos documentos, telefone, endereço nem dados de pagamento.</p>
      </section>
      <section className="rules-block">
        <SectionTitle>Para que usamos</SectionTitle>
        <ul className="info-list">
          <li>Fazer o jogo funcionar: entrar na sua conta em qualquer aparelho, montar salas, guardar o seu histórico.</li>
          <li>Mandar o link de “Esqueci a senha” para o e-mail da conta. Não enviamos propaganda por e-mail.</li>
          <li>Manter o site seguro e corrigir problemas.</li>
        </ul>
        <p>
          O nome e o escudo do seu time, os seus resultados e os seus troféus aparecem para os outros técnicos. O seu e-mail nunca aparece para ninguém.
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>Anúncios e cookies</SectionTitle>
        <p>
          O Leilão FC pode exibir anúncios do Google AdSense fora da área de jogo. Quando isso acontece, o Google e seus parceiros podem usar cookies e
          identificadores do seu navegador para mostrar e medir anúncios, inclusive com base em visitas a este e a outros sites.
        </p>
        <p>
          No aviso de cookies você escolhe entre aceitar ou ficar só com o essencial; nesse caso pedimos ao Google anúncios não personalizados. Você
          também pode ajustar a personalização em{' '}
          <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">
            adssettings.google.com
          </a>{' '}
          e ver como o Google usa esses dados em{' '}
          <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">
            policies.google.com/technologies/partner-sites
          </a>
          .
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>Com quem compartilhamos</SectionTitle>
        <ul className="info-list">
          <li>
            <strong>Hospedagem:</strong> o site e o banco de dados ficam em servidores da Fly.io, na região de São Paulo.
          </li>
          <li>
            <strong>E-mail:</strong> as mensagens de recuperação de senha saem pelo Gmail, do Google.
          </li>
          <li>
            <strong>Publicidade:</strong> o Google AdSense, quando houver anúncios, como descrito acima.
          </li>
        </ul>
        <p>Não vendemos os seus dados. Fora desses serviços, só os entregamos se a lei ou uma ordem judicial exigir.</p>
      </section>
      <section className="rules-block">
        <SectionTitle>Por quanto tempo</SectionTitle>
        <p>
          Os dados da conta e do jogo ficam guardados enquanto a conta existir. As sessões vencem depois de 60 dias sem uso e os links de recuperação de
          senha valem por 1 hora.
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>Seus direitos</SectionTitle>
        <p>
          Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir para confirmar se temos dados seus, receber uma cópia, corrigir o que estiver
          errado e apagar a sua conta. Escreva para <Mail /> do e-mail cadastrado. O e-mail e a senha você também troca sozinho em{' '}
          <Go to="/conta">Conta e senha</Go>.
        </p>
      </section>
      <section className="rules-block">
        <SectionTitle>Crianças e adolescentes</SectionTitle>
        <p>O Leilão FC não é dirigido a menores de 13 anos. Quem tem menos de 18 deve usar o site com o conhecimento dos responsáveis.</p>
      </section>
      <section className="rules-block">
        <SectionTitle>Mudanças nesta política</SectionTitle>
        <p>Se esta política mudar, a data no topo desta página muda junto. Mudanças importantes serão avisadas no próprio site.</p>
      </section>
    </article>
  );
}
