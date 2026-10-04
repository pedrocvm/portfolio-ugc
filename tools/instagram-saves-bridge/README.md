# Conector local dos Salvos da Carol

O guia completo de instalação, ativação, privacidade e recuperação está em [Salvos do Instagram no CarolOS](../../docs/instagram-saved-references.md).

Este programa consulta uma coleção escolhida pela titular a cada cinco minutos. A integração com o Instagram é não oficial. Execute em macOS ou Linux com Python 3.10 ou superior, usando um ambiente virtual. Faça o primeiro login somente no computador autorizado pela titular.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python bridge.py setup
.venv/bin/python bridge.py login
.venv/bin/python bridge.py once
.venv/bin/python bridge.py run
```

Sessão, chave de importação e progresso ficam em uma pasta privada fora do repositório. O CMS nunca recebe a senha ou a sessão do Instagram. Um desafio ou uma sessão rejeitada interrompe a consulta e exige ação da titular no aplicativo oficial.

Testes offline podem ser executados da raiz deste repositório.

```bash
python3 -B -m unittest discover -s tools/instagram-saves-bridge -p 'test_*.py' -v
```

O funcionamento com a conta real permanece pendente da ativação e do teste autenticado local.
