// ============================================================
// MIND RECALL — script-secretaria.js
// Script exclusivo do Painel da Secretaria.
// Refatorado do script.js original com guarda de rota RBAC.
// ============================================================

const SUPABASE_URL = 'https://gijgocyrumhalzqhkggj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SBbgOvJCx21UjRJucquDTQ_kWhEL8Nx';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ==================== VARIÁVEIS GLOBAIS ====================
let usuarioLogado = null;
let alunoEditando = null;
let cursoEditandoId = null;
let alunoNotasId = null;
let confirmCallback = null;
let pagamentosCache = [];
let turmaSelecionadaVisao = null; // turma atualmente selecionada na Visão Geral

// ==================== MÁSCARA DE MOEDA ====================
function aplicarMascaraMoeda(input) {
    let raw = input.value.replace(/\D/g, '');
    if (raw.length === 0) { input.value = ''; return; }
    raw = raw.padStart(3, '0');
    const centavos = raw.slice(-2);
    let reais = raw.slice(0, -2).replace(/^0+/, '') || '0';
    reais = reais.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    input.value = `R$ ${reais},${centavos}`;
}

function parseMoeda(valorMascarado) {
    const limpo = (valorMascarado || '')
        .replace('R$', '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
    return parseFloat(limpo) || 0;
}

// ==================== INICIALIZAÇÃO COM GUARDA DE ROTA ====================
document.addEventListener('DOMContentLoaded', async function () {
    // Verifica sessão existente no Supabase
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        // Sem sessão → redireciona para login
        window.location.href = 'index.html';
        return;
    }

    // Verifica se o tipo é 'secretaria'
    const { data: perfil, error } = await db
        .from('perfis')
        .select('nome, tipo')
        .eq('id', session.user.id)
        .single();

    if (error || !perfil || perfil.tipo !== 'secretaria') {
        // Não é secretaria → redireciona para login
        await db.auth.signOut();
        window.location.href = 'index.html';
        return;
    }

    // Perfil validado — carregar aplicação
    usuarioLogado = { id: session.user.id, email: session.user.email, ...perfil };

    // Exibe saudação
    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) greetingEl.textContent = `Olá, ${perfil.nome || session.user.email}`;

    configurarEventos();
    iniciarAplicacao();

    // Ouve logout
    db.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
            usuarioLogado = null;
            window.location.href = 'index.html';
        }
    });
});

// ==================== AUTENTICAÇÃO ====================
async function sairSistema() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

function iniciarAplicacao() {
    document.getElementById('app').style.display = 'block';

    const primeiroLink = document.querySelector('.tablinks');
    if (primeiroLink) {
        openTab({ currentTarget: primeiroLink }, 'sobre');
    } else {
        document.getElementById('sobre').style.display = 'block';
    }

    atualizarDashboard();
    carregarCursos();
    carregarAlunos();
    carregarOpcoesVinculo();
    carregarVinculos();
    carregarTurmasDisponiveis();
}

// ==================== MODAIS CUSTOMIZADOS ====================
function mostrarAlerta(mensagem, titulo = 'Atenção') {
    document.getElementById('alerta-titulo').textContent = titulo;
    document.getElementById('alerta-mensagem').textContent = mensagem;
    document.getElementById('modal-alerta').classList.add('active');
}

function fecharModalAlerta() {
    document.getElementById('modal-alerta').classList.remove('active');
}

function mostrarConfirmacao(mensagem, callback, titulo = 'Confirmar Ação') {
    document.getElementById('confirmacao-titulo').textContent = titulo;
    document.getElementById('confirmacao-mensagem').textContent = mensagem;
    confirmCallback = callback;
    document.getElementById('modal-confirmacao').classList.add('active');
}

function fecharModalConfirmacao() {
    document.getElementById('modal-confirmacao').classList.remove('active');
    confirmCallback = null;
}

function confirmarAcao() {
    if (confirmCallback) confirmCallback();
    fecharModalConfirmacao();
}

// ==================== NAVEGAÇÃO ====================
function openTab(evt, tabName) {
    document.querySelectorAll('.tabcontent').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    document.querySelectorAll('.tablinks').forEach(el => {
        el.classList.remove('active');
    });

    const tabToShow = document.getElementById(tabName);
    if (tabToShow) {
        tabToShow.style.display = 'block';
        tabToShow.classList.add('active');
    }

    if (evt && evt.currentTarget) evt.currentTarget.classList.add('active');

    if (tabName === 'dashboard') atualizarDashboard();
    else if (tabName === 'crm' || tabName === 'secretaria') carregarAlunos();
    else if (tabName === 'cursos') carregarCursos();
    else if (tabName === 'diario') carregarAlunosDiario();
    else if (tabName === 'financeiro') carregarFinanceiro();
    else if (tabName === 'professores') {
        carregarOpcoesVinculo();
        carregarVinculos();
        carregarTurmasDisponiveis();
    }
}

// ==================== CURSOS ====================
async function carregarCursos() {
    try {
        const { data: cursos, error } = await db
            .from('cursos')
            .select('*, disciplinas(*)')
            .order('nome');

        if (error) throw error;

        const listaCursos = cursos || [];

        const totalCursosEl = document.getElementById('total-cursos');
        if (totalCursosEl) totalCursosEl.textContent = listaCursos.length;

        const tbody = document.getElementById('lista-cursos');
        if (tbody) {
            tbody.innerHTML = '';
            listaCursos.forEach(curso => {
                const disciplinasTexto = curso.disciplinas && curso.disciplinas.length > 0
                    ? curso.disciplinas.map(d => `${d.nome} (${d.carga_horaria}h)`).join(', ')
                    : '<em>Nenhuma</em>';

                const tr = document.createElement('tr');
                tr.style.color = '#333333';
                tr.style.fontWeight = '500';
                tr.innerHTML = `
                <td>${curso.nome}</td>
                <td>${curso.duracao}</td>
                <td>${disciplinasTexto}</td>
                <td>
                    <button type="button" class="btn-action" onclick="abrirModalEditarCurso('${curso.id}')">Editar</button>
                    <button type="button" class="btn-excluir" onclick="excluirCurso('${curso.id}')">Excluir</button>
                </td>
            `;
                tbody.appendChild(tr);
            });
        }

        const selectsIds = [
            'curso-crm',
            'curso-disciplina',
            'curso-diario',
            'curso-aluno-editar',
            'fin-filtro-curso'
        ].map(id => document.getElementById(id)).filter(Boolean);

        const selectsClass = Array.from(document.querySelectorAll('.curso-select'));
        const selects = [...selectsIds, ...selectsClass];

        selects.forEach(select => {
            if (!select) return;
            while (select.options.length > 1) select.remove(1);
            listaCursos.forEach(curso => {
                const option = document.createElement('option');
                option.value = curso.id;
                option.text = curso.nome;
                select.add(option);
            });
        });
    } catch (e) {
        console.error('Erro ao carregar cursos:', e);
    }
}

async function salvarCurso() {
    const nome = document.getElementById('nome-curso').value.trim();
    const duracao = document.getElementById('duracao-curso').value.trim();

    if (!nome || !duracao) {
        mostrarAlerta('Preencha todos os campos do curso!');
        return;
    }

    const { error } = await db.from('cursos').insert({
        nome,
        duracao,
        criado_por: usuarioLogado.id
    });

    if (error) {
        mostrarAlerta(`Erro ao salvar curso: ${error.message}`);
        return;
    }

    document.getElementById('nome-curso').value = '';
    document.getElementById('duracao-curso').value = '';
    await carregarCursos();
    mostrarAlerta('Curso salvo com sucesso!', 'Sucesso');
}

async function salvarDisciplina() {
    const cursoId = document.getElementById('curso-disciplina').value;
    const nomeDisciplina = document.getElementById('nome-disciplina').value.trim();
    const cargaHoraria = document.getElementById('carga-horaria').value;

    if (!cursoId || !nomeDisciplina || !cargaHoraria) {
        mostrarAlerta('Preencha todos os campos para vincular a disciplina!');
        return;
    }

    const { error } = await db.from('disciplinas').insert({
        curso_id: cursoId,
        nome: nomeDisciplina,
        carga_horaria: parseInt(cargaHoraria)
    });

    if (error) {
        mostrarAlerta(`Erro ao vincular disciplina: ${error.message}`);
        return;
    }

    document.getElementById('nome-disciplina').value = '';
    document.getElementById('carga-horaria').value = '';
    await carregarCursos();
    mostrarAlerta('Disciplina vinculada com sucesso!', 'Sucesso');
}

async function abrirModalEditarCurso(cursoId) {
    const { data: curso, error } = await db
        .from('cursos')
        .select('*')
        .eq('id', cursoId)
        .single();

    if (error || !curso) return;

    cursoEditandoId = cursoId;
    document.getElementById('curso-index-editar').value = cursoId;
    document.getElementById('curso-nome-editar').value = curso.nome;
    document.getElementById('curso-duracao-editar').value = curso.duracao;
    document.getElementById('modal-curso').classList.add('active');
}

function fecharModalCurso() {
    document.getElementById('modal-curso').classList.remove('active');
    cursoEditandoId = null;
}

async function salvarCursoModal() {
    if (!cursoEditandoId) return;

    const novoNome = document.getElementById('curso-nome-editar').value.trim();
    const novaDuracao = document.getElementById('curso-duracao-editar').value.trim();

    if (!novoNome || !novaDuracao) {
        mostrarAlerta('Preencha todos os campos!');
        return;
    }

    const { error } = await db
        .from('cursos')
        .update({ nome: novoNome, duracao: novaDuracao })
        .eq('id', cursoEditandoId);

    if (error) {
        mostrarAlerta(`Erro ao atualizar curso: ${error.message}`);
        return;
    }

    await carregarCursos();
    fecharModalCurso();
    mostrarAlerta('Curso atualizado com sucesso!', 'Sucesso');
}

function excluirCurso(cursoId) {
    mostrarConfirmacao('Tem certeza que deseja apagar este curso? Todas as disciplinas vinculadas serão removidas.', async () => {
        const { error } = await db.from('cursos').delete().eq('id', cursoId);
        if (error) {
            mostrarAlerta(`Erro ao excluir curso: ${error.message}`);
        } else {
            await carregarCursos();
            mostrarAlerta('Curso removido com sucesso!', 'Sucesso');
        }
    });
}

// ==================== ALUNOS ====================
async function matricularAluno() {
    const btn = document.getElementById('btn-matricular');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Aguarde...';
    }

    try {
        const nome = document.getElementById('nome-aluno').value.trim();
        const cpf = document.getElementById('cpf-aluno').value.trim();

        if (!nome || !cpf) {
            throw new Error('Preencha o Nome e o CPF do aluno.');
        }

        const cursosEntries = document.querySelectorAll('.curso-entry');
        const cursosSelecionados = [];
        let valorTotal = 0;

        for (const entry of cursosEntries) {
            const cursoId = entry.querySelector('.curso-select').value;
            const turma = entry.querySelector('.turma-input').value.trim();
            const valorInputVal = entry.querySelector('.valor-input').value;
            const valor = parseMoeda(valorInputVal);

            const contratoInput = entry.querySelector('.contrato-input');
            const arquivoContrato = contratoInput && contratoInput.files[0] ? contratoInput.files[0] : null;

            if (!cursoId || !turma || isNaN(valor) || !valorInputVal) {
                throw new Error('Preencha corretamente o Curso, a Turma e o Valor para todos os cursos adicionados.');
            }

            if (!arquivoContrato) {
                throw new Error('É obrigatório anexar o Contrato (PDF) para todos os cursos.');
            }

            let contratoBase64 = null;
            try {
                contratoBase64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = error => reject(error);
                    reader.readAsDataURL(arquivoContrato);
                });
            } catch (e) {
                throw new Error('Falha ao ler o arquivo PDF anexado. Tente enviar novamente.');
            }

            cursosSelecionados.push({ cursoId, turma, valor, contratoBase64 });
            valorTotal += valor;
        }

        if (cursosSelecionados.length === 0) {
            throw new Error('Adicione pelo menos um curso para realizar a matrícula.');
        }

        const formaPagamento = document.getElementById('forma-pagamento').value;
        const numeroParcelas = formaPagamento === 'parcelado'
            ? parseInt(document.getElementById('numero-parcelas').value)
            : 1;

        const { data: cpfExiste, error: errCpf } = await db.from('alunos').select('id').eq('cpf', cpf).maybeSingle();
        if (errCpf) throw new Error(`Erro de conexão ao verificar CPF: ${errCpf.message}`);
        if (cpfExiste) throw new Error('Já existe um aluno cadastrado com este CPF.');

        const dataMatricula = new Date().toISOString().split('T')[0];

        const primeiroCurso = cursosSelecionados[0];
        const { data: cursoData, error: errCursoData } = await db
            .from('cursos')
            .select('nome')
            .eq('id', primeiroCurso.cursoId)
            .single();

        if (errCursoData) throw new Error(`Erro ao buscar dados do curso: ${errCursoData.message}`);

        const { data: novoAluno, error: erroAluno } = await db
            .from('alunos')
            .insert({
                nome,
                cpf,
                curso_id: primeiroCurso.cursoId,
                curso_nome: cursoData ? cursoData.nome : '',
                turma: primeiroCurso.turma,
                valor: valorTotal,
                forma_pagamento: formaPagamento,
                data_matricula: dataMatricula,
                criado_por: usuarioLogado ? usuarioLogado.id : null
            })
            .select()
            .single();

        if (erroAluno) throw new Error(`Erro de conexão ao cadastrar aluno: ${erroAluno.message}`);

        for (const item of cursosSelecionados) {
            const { error: erroMatricula } = await db.from('matriculas').insert({
                aluno_id: novoAluno.id,
                curso_id: item.cursoId,
                turma: item.turma,
                contrato_url: item.contratoBase64,
                data_matricula: dataMatricula,
                criado_por: usuarioLogado ? usuarioLogado.id : null
            });
            if (erroMatricula) throw new Error(`Erro ao criar vínculo de matrícula: ${erroMatricula.message}`);

            if (formaPagamento === 'parcelado') {
                const metodoPag = document.getElementById('metodo-parcelamento').value;
                const parcelas = gerarParcelas(item.valor, numeroParcelas, dataMatricula, novoAluno.id, item.cursoId, metodoPag);
                if (parcelas.length > 0) {
                    const { error: erroFin } = await db.from('pagamentos').insert(parcelas);
                    if (erroFin) throw new Error(`Erro ao gerar parcelas: ${erroFin.message}`);
                }
            } else if (formaPagamento === 'a-vista') {
                const metodo = document.getElementById('metodo-pagamento').value;
                const { error: erroPag } = await db.from('pagamentos').insert({
                    aluno_id: novoAluno.id,
                    curso_id: item.cursoId,
                    valor_pago: item.valor,
                    forma_pagamento: metodo,
                    status: 'Pago',
                    data_pagamento: dataMatricula,
                    criado_por: usuarioLogado ? usuarioLogado.id : null
                });
                if (erroPag) throw new Error(`Erro ao lançar pagamento à vista: ${erroPag.message}`);
            }
        }

        document.getElementById('form-secretaria').reset();
        document.getElementById('parcelas-container').style.display = 'none';
        const containerMetodoP = document.getElementById('metodo-parcelamento-container');
        if (containerMetodoP) containerMetodoP.style.display = 'none';
        document.getElementById('metodo-pagamento-container').style.display = 'flex';

        const container = document.getElementById('cursos-container');
        const extraEntries = container.querySelectorAll('.curso-entry:not(:first-child)');
        extraEntries.forEach(el => el.remove());

        await carregarAlunos();

        mostrarAlerta('Aluno cadastrado e matriculado com sucesso!', 'Sucesso');

    } catch (e) {
        console.error('Erro no fluxo de matrícula:', e);
        mostrarAlerta(e.message || 'Ocorreu um erro ao efetivar a matrícula.', 'Erro de Validação/Conexão');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

function gerarParcelas(valorTotal, numeroParcelas, dataMatricula, alunoId, cursoId, metodoPagamento) {
    const parcelas = [];
    const valorParcela = valorTotal / numeroParcelas;

    for (let i = 0; i < numeroParcelas; i++) {
        const vencimento = new Date(dataMatricula + 'T12:00:00');
        vencimento.setDate(vencimento.getDate() + (i * 30));

        parcelas.push({
            aluno_id: alunoId,
            curso_id: cursoId,
            valor_pago: parseFloat(valorParcela.toFixed(2)),
            forma_pagamento: metodoPagamento,
            data_pagamento: vencimento.toISOString().split('T')[0],
            status: 'Pendente',
            observacao: `Parcela ${i + 1}/${numeroParcelas}`
        });
    }
    return parcelas;
}

async function carregarAlunos() {
    try {
        const { data: alunos, error } = await db
            .from('alunos')
            .select('*, pagamentos(*), notas(*), matriculas(*, cursos(nome))')
            .order('criado_em', { ascending: false });

        if (error) throw error;

        const listaAlunos = alunos || [];

        const totalAlunosEl = document.getElementById('total-alunos');
        if (totalAlunosEl) totalAlunosEl.textContent = listaAlunos.length;

        // ── Tabela CRM ──
        const tbodyCrm = document.getElementById('lista-alunos');
        const filtroCursoEl = document.getElementById('curso-crm');

        if (tbodyCrm) {
            tbodyCrm.innerHTML = '';
            const filtroCurso = filtroCursoEl ? filtroCursoEl.value : '';
            const filtroTurmaEl = document.getElementById('turma-crm');
            const filtroTurma = filtroTurmaEl ? filtroTurmaEl.value.toLowerCase() : '';

            const filtrados = listaAlunos.filter(a => {
                const noLegado = a.curso_id === filtroCurso;
                const nasMatriculas = (a.matriculas || []).some(m => m.curso_id === filtroCurso);
                const matchCurso = !filtroCurso || noLegado || nasMatriculas;

                const matchTurma = !filtroTurma ||
                    (a.turma && a.turma.toLowerCase().includes(filtroTurma)) ||
                    (a.nome && a.nome.toLowerCase().includes(filtroTurma)) ||
                    (a.ra && String(a.ra).includes(filtroTurma));

                return matchCurso && matchTurma;
            });

            filtrados.forEach(aluno => {
                const parcelas = aluno.pagamentos || [];
                let statusParcelas = '';
                let tagHtml = '';

                // Prioridade 4: VAZIO (Cinza)
                if (parcelas.length === 0) {
                    statusParcelas = 'SEM FATURAS';
                    tagHtml = `<span class="badge" style="background-color: #f3f4f6; color: #4b5563; font-weight: bold; border: 1px solid #d1d5db;">${statusParcelas}</span>`;
                } else {
                    const hoje = new Date();
                    hoje.setHours(0, 0, 0, 0); // Zera as horas para comparar só o dia

                    let qtdNaoPagas = 0;
                    let qtdVencidas = 0;

                    for (const p of parcelas) {
                        const status = (p.status || '').toLowerCase();
                        if (status === 'pago' || status === 'cancelado') continue;

                        qtdNaoPagas++; // Conta o total de pendências

                        // Parsing de Datas Seguro
                        let dataFatura = hoje; // fallback
                        if (p.data_pagamento) {
                            let partes = p.data_pagamento.split(/[-/]/);
                            let ano = partes[0].length === 4 ? partes[0] : partes[2];
                            let mes = partes[1];
                            let dia = partes[0].length === 4 ? partes[2] : partes[0];

                            dataFatura = new Date(`${ano}-${mes}-${dia}T00:00:00`);
                            dataFatura.setHours(0, 0, 0, 0);
                        }

                        // Verifica se ESTA parcela específica está vencida
                        if (status === 'atrasado' || status === 'vencido' || (status === 'pendente' && dataFatura < hoje)) {
                            qtdVencidas++;
                        }
                    }

                    if (qtdVencidas > 0) {
                        // Prioridade 1: INADIMPLENTE (Vermelho) - Mostra apenas a quantidade real que passou da data
                        const plural = qtdVencidas > 1 ? 'Vencidos' : 'Vencido';
                        statusParcelas = `ATRASADO (${qtdVencidas} ${plural})`;
                        tagHtml = `<span class="badge" style="background-color: #fee2e2; color: #b91c1c; font-weight: bold; border: 1px solid #f87171;">${statusParcelas}</span>`;
                    } else if (qtdNaoPagas > 0) {
                        // Prioridade 2: EM DIA (Laranja/Amarelo) - Pendentes pro futuro
                        statusParcelas = `EM DIA (Faltam ${qtdNaoPagas})`;
                        tagHtml = `<span class="badge" style="background-color: #fef3c7; color: #b45309; font-weight: bold; border: 1px solid #fbbf24;">${statusParcelas}</span>`;
                    } else {
                        // Prioridade 3: PAGO (Verde)
                        const pagamentosPagos = parcelas.filter(p => p.status && p.status.toLowerCase() === 'pago');
                        const ultimaForma = pagamentosPagos.length > 0
                            ? pagamentosPagos.sort((a, b) => new Date(b.data_pagamento || 0) - new Date(a.data_pagamento || 0))[0].forma_pagamento
                            : 'Indefinida';

                        statusParcelas = `PAGO VIA ${ultimaForma.toUpperCase()}`;
                        tagHtml = `<span class="badge" style="background-color: #d1fae5; color: #047857; font-weight: bold; border: 1px solid #34d399;">${statusParcelas}</span>`;
                    }
                }

                const matriculas = aluno.matriculas || [];
                let cursosHtml;
                if (matriculas.length > 0) {
                    cursosHtml = `<div class="cursos-chips">${matriculas.map(m => `<span class="curso-chip">${m.cursos ? m.cursos.nome : '-'}</span>`).join('')
                        }</div>`;
                } else {
                    cursosHtml = aluno.curso_nome || '-';
                }

                const tr = document.createElement('tr');
                tr.style.color = '#333333';
                tr.style.fontWeight = '500';
                const raText = aluno.ra ? ` - RA: ${aluno.ra}` : '';
                tr.innerHTML = `
                <td><strong>${aluno.nome}</strong><span style="color:var(--txt-light); font-size: 0.85em;">${raText}</span></td>
                <td>${aluno.cpf || '-'}</td>
                <td>${cursosHtml}</td>
                <td>${aluno.turma || '-'}</td>
                <td>${tagHtml}</td>
                <td>
                    <button type="button" class="btn-action" onclick="abrirFichaCadastral('${aluno.id}')">👁 Ver Ficha</button>
                    <button type="button" class="btn-action" onclick="abrirModalAluno('${aluno.id}')">Abrir Histórico</button>
                </td>
            `;
                tbodyCrm.appendChild(tr);
            });
        }

        // ── Tabela Secretaria ──
        const tbodySecretaria = document.getElementById('lista-secretaria-alunos');

        if (tbodySecretaria) {
            tbodySecretaria.innerHTML = '';
            alunos.forEach(aluno => {
                let dataFormatada = '-';
                if (aluno.data_matricula) {
                    const partes = aluno.data_matricula.split('-');
                    if (partes.length === 3) dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
                }

                const matriculas = aluno.matriculas || [];
                let cursosTexto;
                if (matriculas.length > 0) {
                    cursosTexto = `<div class="cursos-chips">${matriculas.map(m => `<span class="curso-chip">${m.cursos ? m.cursos.nome : '-'}</span>`).join('')
                        }</div>`;
                } else {
                    cursosTexto = aluno.curso_nome || '-';
                }

                const tr = document.createElement('tr');
                const raText = aluno.ra ? ` - RA: ${aluno.ra}` : '';
                tr.innerHTML = `
                <td><strong>${aluno.nome}</strong><span style="color:var(--txt-light); font-size: 0.85em;">${raText}</span></td>
                <td>${aluno.cpf || '-'}</td>
                <td>${cursosTexto}</td>
                <td>${dataFormatada}</td>
                <td>
                    <button type="button" class="btn-action" style="margin-right: 8px;" onclick="abrirFichaCadastral('${aluno.id}')">👁 Ver Ficha</button>
                    <button type="button" class="btn-excluir" onclick="excluirAluno('${aluno.id}')">Remover Aluno</button>
                </td>
            `;
                tbodySecretaria.appendChild(tr);
            });
        }
    } catch (e) {
        console.error('Erro geral ao carregar alunos:', e);
    }
}

function excluirAluno(alunoId) {
    mostrarConfirmacao(
        'Tem certeza absoluta que deseja REMOVER este aluno? Todo o histórico de notas e financeiro será apagado.',
        async () => {
            const { error } = await db.from('alunos').delete().eq('id', alunoId);
            if (error) {
                mostrarAlerta(`Erro ao remover aluno: ${error.message}`);
                return;
            }
            await carregarAlunos();
            await carregarAlunosDiario();
            await atualizarDashboard();
            mostrarAlerta('Aluno removido do sistema com sucesso!', 'Sucesso');
        }
    );
}

async function abrirModalAluno(alunoId) {
    try {
        // 1. Busca aluno
        const { data: aluno, error: errAluno } = await db
            .from('alunos')
            .select('*')
            .eq('id', alunoId)
            .single();

        if (errAluno) throw errAluno;
        if (!aluno) return;

        // 2. Busca matriculas
        const { data: matriculasData, error: errMat } = await db
            .from('matriculas')
            .select('*')
            .eq('aluno_id', alunoId);

        if (errMat) throw errMat;

        // 3. Busca cursos para mapear nomes
        const { data: cursosData, error: errCursos } = await db
            .from('cursos')
            .select('id, nome');

        if (errCursos) throw errCursos;

        const mapCursos = {};
        if (cursosData) {
            cursosData.forEach(c => mapCursos[c.id] = c.nome);
        }

        // 4. Busca pagamentos
        const { data: pagamentosData, error: errPag } = await db
            .from('pagamentos')
            .select('*')
            .eq('aluno_id', alunoId);

        if (errPag) throw errPag;

        alunoEditando = aluno;

        const modalTitle = document.getElementById('titulo-modal-aluno');
        if (modalTitle) {
            modalTitle.textContent = `Ficha do Aluno ${aluno.ra ? '— RA: ' + aluno.ra : ''}`;
        }

        document.getElementById('aluno-id-editar').value = aluno.id;
        document.getElementById('nome-aluno-editar').value = aluno.nome;
        document.getElementById('cpf-aluno-editar').value = aluno.cpf || '';
        document.getElementById('valor-aluno-editar').value = aluno.valor || 0;

        const cursosListaContainer = document.getElementById('cursos-aluno-lista');
        if (cursosListaContainer) {
            cursosListaContainer.innerHTML = '';
            const matriculas = matriculasData || [];
            if (matriculas.length > 0) {
                matriculas.forEach(m => {
                    const cursoNome = m.curso_id && mapCursos[m.curso_id] ? mapCursos[m.curso_id] : '-';
                    const div = document.createElement('div');
                    div.style = 'display: flex; justify-content: space-between; align-items: center; background: var(--panel-off); padding: 8px 12px; border-radius: var(--r-sm); border: 1px solid var(--panel-border);';

                    let btnHtml = '';
                    if (m.contrato_url) {
                        btnHtml = `<button type="button" class="btn-action" style="font-size: 0.75em; padding: 4px 8px;" onclick="verContratoMatricula('${m.id}')">📄 Ver Contrato</button>`;
                    }

                    div.innerHTML = `
                        <div style="display: flex; flex-direction: column;">
                            <strong style="color: var(--txt-dark); font-size: 0.9em;">${cursoNome}</strong>
                            <span style="color: var(--txt-light); font-size: 0.8em;">Turma: ${m.turma || '-'}</span>
                        </div>
                        ${btnHtml}
                    `;
                    cursosListaContainer.appendChild(div);
                });
            } else {
                cursosListaContainer.innerHTML = '<span style="color: var(--txt-light); font-size: 0.9em;">Nenhum curso matriculado.</span>';
            }
        }

        // Renderiza pagamentos financeiros (Boletos)
        const vencimentosContainer = document.getElementById('vencimentos-aluno-container');
        const parcelasContainer = document.getElementById('parcelas-aluno-container');

        if (vencimentosContainer && parcelasContainer) {
            const parcelas = pagamentosData || [];

            if (parcelas.length > 0) {
                vencimentosContainer.style.display = 'block';
                parcelasContainer.innerHTML = '';

                const agrupado = {};
                parcelas.forEach(p => {
                    const cursoNome = p.curso_id && mapCursos[p.curso_id] ? mapCursos[p.curso_id] : 'Outros Boletos';
                    if (!agrupado[cursoNome]) agrupado[cursoNome] = [];
                    agrupado[cursoNome].push(p);
                });

                for (const [curso, lista] of Object.entries(agrupado)) {
                    const titulo = document.createElement('h5');
                    titulo.textContent = `Boletos - ${curso}`;
                    titulo.style.marginTop = '15px';
                    titulo.style.marginBottom = '10px';
                    titulo.style.color = 'var(--txt-navy)';
                    titulo.style.borderBottom = '1px solid var(--panel-border)';
                    titulo.style.paddingBottom = '4px';
                    parcelasContainer.appendChild(titulo);

                    lista
                        // se tiver numero_parcela na observacao ou usar id sort, mas pagamentos normais nao tem numero_parcela, ordenamos por vencimento
                        .sort((a, b) => new Date(a.data_pagamento) - new Date(b.data_pagamento))
                        .forEach((parcela, index) => {
                            const isPaga = parcela.status === 'Pago';
                            const numParcela = lista.length > 1 ? (index + 1) + '/' + lista.length : 'Única';

                            const card = document.createElement('div');
                            card.className = 'parcela-card';
                            card.innerHTML = `
                                <div class="parcela-info">
                                    <span class="parcela-numero">Parcela ${numParcela}</span>
                                    <span class="parcela-valor">R$ ${parseFloat(parcela.valor_pago).toFixed(2)}</span>
                                    <span class="parcela-vencimento">Vencimento: ${parcela.data_pagamento}</span>
                                </div>
                                <div class="parcela-actions">
                                    <span class="badge ${isPaga ? 'badge-pago' : (parcela.status === 'Cancelado' ? 'badge-atrasado' : 'badge-pendente')}">
                                        ${parcela.status}
                                    </span>
                                    ${!isPaga
                                    ? `<button type="button" class="btn-action btn-baixa" onclick="darBaixaParcelaModal('${parcela.id}', this)">Baixa</button>`
                                    : ''}
                                </div>
                            `;
                            parcelasContainer.appendChild(card);
                        });
                }
            } else {
                vencimentosContainer.style.display = 'none';
            }
        }

        document.getElementById('modal-aluno').classList.add('active');
    } catch (e) {
        console.error('Erro detalhado ao abrir modal do aluno:', e.message || e);
        mostrarAlerta('Erro ao carregar dados do aluno. Verifique o console para mais detalhes.');
    }
}

function fecharModalAluno() {
    document.getElementById('modal-aluno').classList.remove('active');
    alunoEditando = null;
}

async function salvarEdicaoAluno() {
    if (!alunoEditando) return;

    const updateData = {
        nome: document.getElementById('nome-aluno-editar').value.trim(),
        cpf: document.getElementById('cpf-aluno-editar').value.trim(),
        valor: parseFloat(document.getElementById('valor-aluno-editar').value)
    };

    const { error } = await db
        .from('alunos')
        .update(updateData)
        .eq('id', alunoEditando.id);

    if (error) {
        mostrarAlerta(`Erro ao salvar: ${error.message}`);
        return;
    }

    fecharModalAluno();
    await carregarAlunos();
    await atualizarDashboard();
    mostrarAlerta('Ficha do aluno atualizada com sucesso!', 'Sucesso');
}

function verContratoMatricula(matriculaId) {
    if (!alunoEditando || !alunoEditando.matriculas) return;
    const matricula = alunoEditando.matriculas.find(m => m.id === matriculaId);
    if (!matricula || !matricula.contrato_url) {
        mostrarAlerta('Nenhum contrato anexado para este curso.');
        return;
    }
    const pdfWindow = window.open();
    if (pdfWindow) {
        pdfWindow.document.write(`<iframe src="${matricula.contrato_url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%; position:absolute;" allowfullscreen></iframe>`);
        pdfWindow.document.close();
    } else {
        mostrarAlerta('O bloqueador de pop-ups impediu a abertura do contrato.');
    }
}

async function darBaixaParcelaModal(parcelaId, btnElement) {
    const hoje = new Date().toISOString().split('T')[0];
    const { error } = await db
        .from('pagamentos')
        .update({ status: 'Pago', data_pagamento: hoje })
        .eq('id', parcelaId);

    if (error) {
        mostrarAlerta(`Erro ao dar baixa: ${error.message}`);
        return;
    }

    const card = btnElement ? btnElement.closest('.parcela-card') : null;
    if (card) {
        const badge = card.querySelector('.badge');
        if (badge) {
            badge.className = 'badge badge-pago';
            badge.textContent = 'Pago';
        }
        btnElement.remove();
    }

    await atualizarDashboard();
}

// ==================== DIÁRIO DE CLASSE ====================
async function carregarAlunosDiario() {
    try {
        const tbody = document.getElementById('lista-diario');
        const filtroCursoEl = document.getElementById('curso-diario');
        if (!tbody) return;

        let query = db
            .from('matriculas')
            .select('*, alunos(nome, cpf, ra), cursos(nome)')
            .order('alunos(nome)');

        const filtroCurso = filtroCursoEl ? filtroCursoEl.value : '';
        if (filtroCurso) query = query.eq('curso_id', filtroCurso);

        const { data: matriculas, error } = await query;

        if (error) throw error;

        const listaMatriculas = matriculas || [];

        tbody.innerHTML = '';

        const filtroTurmaEl = document.getElementById('turma-diario');
        const filtroTurma = filtroTurmaEl ? filtroTurmaEl.value.toLowerCase() : '';

        const filtrados = filtroTurma
            ? listaMatriculas.filter(m => {
                const nomeTurma = m.turma ? m.turma.toLowerCase() : '';
                const nomeAluno = (m.alunos && m.alunos.nome) ? m.alunos.nome.toLowerCase() : '';
                const raAluno = (m.alunos && m.alunos.ra) ? String(m.alunos.ra) : '';
                return nomeTurma.includes(filtroTurma) || nomeAluno.includes(filtroTurma) || raAluno.includes(filtroTurma);
            })
            : listaMatriculas;

        filtrados.forEach(m => {
            const nomeAluno = m.alunos ? m.alunos.nome : '-';
            const nomeCurso = m.cursos ? m.cursos.nome : '-';

            const n1 = m.nota1 !== null && m.nota1 !== undefined ? m.nota1 : null;
            const n2 = m.nota2 !== null && m.nota2 !== undefined ? m.nota2 : null;
            const media = m.media !== null && m.media !== undefined ? m.media : null;

            const status = media !== null ? (media >= 7 ? 'Aprovado' : 'Em Recuperação') : '-';
            const badgeClass = media !== null ? (media >= 7 ? 'badge-aprovado' : 'badge-recuperacao') : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${nomeAluno}</td>
                <td>${nomeCurso}</td>
                <td>${m.turma || '-'}</td>
                <td>${n1 !== null ? n1 : '-'}</td>
                <td>${n2 !== null ? n2 : '-'}</td>
                <td><strong>${media !== null ? parseFloat(media).toFixed(1) : '-'}</strong></td>
                <td>${media !== null ? `<span class="badge ${badgeClass}">${status}</span>` : '-'}</td>
                <td>
                    <button type="button" class="btn-action" onclick="abrirModalNotas('${m.id}', '${nomeAluno.replace(/'/g, "\\'")}', '${nomeCurso.replace(/'/g, "\\'")}')">Lançar Notas</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error('Erro geral ao carregar alunos no diário:', e);
    }
}

async function abrirModalNotas(matriculaId, nomeAluno, nomeCurso) {
    const { data: matricula } = await db
        .from('matriculas')
        .select('nota1, nota2')
        .eq('id', matriculaId)
        .single();

    alunoNotasId = matriculaId;
    document.getElementById('aluno-id-notas').value = matriculaId;

    const subtitle = document.getElementById('notas-aluno-curso-subtitle');
    if (subtitle) {
        subtitle.innerHTML = `<strong>Aluno:</strong> ${nomeAluno} &nbsp;|&nbsp; <strong>Curso:</strong> ${nomeCurso}`;
    }

    document.getElementById('nota1-input').value = matricula && matricula.nota1 !== null ? matricula.nota1 : '';
    document.getElementById('nota2-input').value = matricula && matricula.nota2 !== null ? matricula.nota2 : '';
    document.getElementById('modal-notas').classList.add('active');
}

function fecharModalNotas() {
    document.getElementById('modal-notas').classList.remove('active');
    alunoNotasId = null;
}

async function salvarNotasModal() {
    if (alunoNotasId === null) return;

    const nota1Str = document.getElementById('nota1-input').value;
    const nota2Str = document.getElementById('nota2-input').value;

    if (nota1Str === '' || nota2Str === '') {
        mostrarAlerta('Preencha os dois campos de notas!');
        return;
    }

    const n1 = parseFloat(nota1Str);
    const n2 = parseFloat(nota2Str);

    const { error } = await db
        .from('matriculas')
        .update({ nota1: n1, nota2: n2 })
        .eq('id', alunoNotasId);

    if (error) {
        mostrarAlerta(`Erro ao salvar notas: ${error.message}`);
        return;
    }

    fecharModalNotas();
    await carregarAlunosDiario();
    mostrarAlerta('As notas do aluno foram salvas com sucesso!', 'Sucesso');
}

// ==================== DASHBOARD ====================
async function atualizarDashboard() {
    const { count: totalAlunos } = await db
        .from('alunos')
        .select('*', { count: 'exact', head: true });

    const { count: totalCursos } = await db
        .from('cursos')
        .select('*', { count: 'exact', head: true });

    const totalAlunosEl = document.getElementById('total-alunos');
    const totalCursosEl = document.getElementById('total-cursos');
    if (totalAlunosEl) totalAlunosEl.textContent = totalAlunos ?? 0;
    if (totalCursosEl) totalCursosEl.textContent = totalCursos ?? 0;

    const { count: pendentes } = await db
        .from('financeiro')
        .select('*', { count: 'exact', head: true })
        .eq('paga', false);

    const { count: pagas } = await db
        .from('financeiro')
        .select('*', { count: 'exact', head: true })
        .eq('paga', true);

    const parcelasPendentesEl = document.getElementById('parcelas-pendentes');
    const parcelasPagasEl = document.getElementById('parcelas-pagas');
    if (parcelasPendentesEl) parcelasPendentesEl.textContent = pendentes ?? 0;
    if (parcelasPagasEl) parcelasPagasEl.textContent = pagas ?? 0;

    const { data: pgtos } = await db
        .from('pagamentos')
        .select('valor_pago')
        .eq('status', 'Pago');

    const totalRecebido = (pgtos || []).reduce((sum, p) => sum + parseFloat(p.valor_pago || 0), 0);
    const totalRecebidoEl = document.getElementById('total-recebido');
    if (totalRecebidoEl) {
        totalRecebidoEl.textContent = `R$ ${totalRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
}

// ==================== MÓDULO FINANCEIRO ====================
async function carregarFinanceiro() {
    const tbody = document.getElementById('lista-pagamentos');
    const emptyMsg = document.getElementById('fin-empty-msg');
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:32px; color:var(--txt-light);">
                    <span class="spinner" style="display:inline-block; margin-right:10px;"></span>
                    Carregando pagamentos...
                </td>
            </tr>`;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    try {
        const { data: pagamentos, error } = await db
            .from('pagamentos')
            .select('*, alunos(nome, ra), cursos(nome)')
            .order('data_pagamento', { ascending: false });

        if (error) throw error;

        pagamentosCache = pagamentos || [];
        atualizarCardsPagamentos(pagamentosCache);
        renderizarTabelaPagamentos(pagamentosCache);
    } catch (e) {
        console.error('Erro ao carregar pagamentos:', e);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center; padding:32px; color:var(--vermelho);">
                        ⚠️ Erro ao carregar pagamentos: ${e.message}
                    </td>
                </tr>`;
        }
    }
}

function atualizarCardsPagamentos(lista) {
    const somentePagos = lista.filter(p => p.status === 'Pago');
    const totalRecebido = somentePagos.reduce((s, p) => s + parseFloat(p.valor_pago || 0), 0);
    const totalPix = somentePagos.filter(p => p.forma_pagamento === 'Pix').reduce((s, p) => s + parseFloat(p.valor_pago || 0), 0);
    const totalCartao = somentePagos
        .filter(p => p.forma_pagamento === 'Cartão de Crédito' || p.forma_pagamento === 'Cartão de Débito')
        .reduce((s, p) => s + parseFloat(p.valor_pago || 0), 0);

    const fmt = v => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const el = id => document.getElementById(id);
    if (el('fin-total-recebido')) el('fin-total-recebido').textContent = fmt(totalRecebido);
    if (el('fin-total-count')) el('fin-total-count').textContent = lista.length;
    if (el('fin-total-pix')) el('fin-total-pix').textContent = fmt(totalPix);
    if (el('fin-total-cartao')) el('fin-total-cartao').textContent = fmt(totalCartao);
}

function renderizarTabelaPagamentos(lista) {
    const tbody = document.getElementById('lista-pagamentos');
    const emptyMsg = document.getElementById('fin-empty-msg');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (lista.length === 0) {
        if (emptyMsg) emptyMsg.style.display = 'block';
        return;
    }
    if (emptyMsg) emptyMsg.style.display = 'none';

    lista.forEach(pag => {
        const nomeAluno = pag.alunos ? pag.alunos.nome : '-';
        const nomeCurso = pag.cursos ? pag.cursos.nome : '-';
        const valor = parseFloat(pag.valor_pago || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const data = pag.data_pagamento
            ? (() => { const [y, m, d] = pag.data_pagamento.split('-'); return `${d}/${m}/${y}`; })()
            : '-';

        const tr = document.createElement('tr');
        tr.style.color = '#333333';
        tr.style.fontWeight = '500';
        tr.innerHTML = `
            <td><strong>${nomeAluno}</strong></td>
            <td>${nomeCurso}</td>
            <td class="valor-pago-cell">R$ ${valor}</td>
            <td>${getBadgeForma(pag.forma_pagamento)}</td>
            <td>${data}</td>
            <td>${getBadgeStatus(pag.status)}</td>
            <td>${pag.observacao ? `<span title="${pag.observacao}" style="cursor:help">${pag.observacao.length > 30 ? pag.observacao.substring(0, 30) + '...' : pag.observacao}</span>` : '<em style="color:var(--txt-light)">—</em>'}</td>
            <td style="display: flex; gap: 8px;">
                <button type="button" class="btn-action" style="background-color: var(--primaria); border-radius: var(--r-sm);" onclick="abrirModalEdicaoPagamento('${pag.id}')">Editar</button>
                <button type="button" class="btn-excluir" style="background-color: var(--ouro); color: var(--navy); border-radius: var(--r-sm);" onclick="estornarPagamento('${pag.id}')">Estornar</button>
                <button type="button" class="btn-excluir" style="background-color: var(--vermelho); color: var(--branco); border-radius: var(--r-sm);" onclick="apagarPagamentoDefinitivo('${pag.id}')">Apagar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function getBadgeForma(forma) {
    const mapa = {
        'Pix': { cls: 'badge-pix', icone: '⚡' },
        'Cartão de Crédito': { cls: 'badge-cartao', icone: '💳' },
        'Cartão de Débito': { cls: 'badge-cartao', icone: '💳' },
        'Boleto': { cls: 'badge-boleto', icone: '🏦' },
        'Dinheiro': { cls: 'badge-dinheiro', icone: '💵' },
        'Transferência': { cls: 'badge-transferencia', icone: '🏛️' }
    };
    const info = mapa[forma] || { cls: '', icone: '' };
    return `<span class="${info.cls}">${info.icone} ${forma || '-'}</span>`;
}

function getBadgeStatus(status) {
    const mapa = {
        'Pago': { cls: 'badge-status-pago', icone: '✅' },
        'Pendente': { cls: 'badge-status-pendente', icone: '⏳' },
        'Atrasado': { cls: 'badge-status-atrasado', icone: '🔴' },
        'Cancelado': { cls: 'badge-status-cancelado', icone: '❌' }
    };
    const info = mapa[status] || { cls: '', icone: '' };
    return `<span class="${info.cls}">${info.icone} ${status || '-'}</span>`;
}

function filtrarPagamentos() {
    const busca = (document.getElementById('fin-busca')?.value || '').toLowerCase().trim();
    const cursofiltro = document.getElementById('fin-filtro-curso')?.value || '';
    const formafiltro = document.getElementById('fin-filtro-forma')?.value || '';
    const statusfiltro = document.getElementById('fin-filtro-status')?.value || '';

    const filtrados = pagamentosCache.filter(p => {
        const nomeAluno = (p.alunos?.nome || '').toLowerCase();
        const raAluno = p.alunos?.ra ? String(p.alunos.ra) : '';
        const cursoId = p.curso_id || '';
        const forma = p.forma_pagamento || '';
        const status = p.status || '';

        return (
            (!busca || nomeAluno.includes(busca) || raAluno.includes(busca)) &&
            (!cursofiltro || cursoId === cursofiltro) &&
            (!formafiltro || forma === formafiltro) &&
            (!statusfiltro || status === statusfiltro)
        );
    });

    atualizarCardsPagamentos(filtrados);
    renderizarTabelaPagamentos(filtrados);
}

async function abrirModalPagamento() {
    document.getElementById('form-pagamento').reset();
    document.getElementById('pag-id').value = '';
    document.getElementById('pag-aluno-id').value = '';
    document.getElementById('pag-data').value = new Date().toISOString().split('T')[0];

    const selectCurso = document.getElementById('pag-curso');
    selectCurso.innerHTML = '<option value="">Buscar aluno primeiro</option>';

    document.getElementById('modal-pagamento').classList.add('active');
}

async function buscarAlunoPorRaParaPagamento() {
    const ra = document.getElementById('pag-ra').value.trim();
    if (!ra) {
        mostrarAlerta('Digite um RA para buscar!');
        return;
    }

    const { data: aluno, error } = await db
        .from('alunos')
        .select('id, nome, ra')
        .eq('ra', ra)
        .single();

    if (error || !aluno) {
        mostrarAlerta('Aluno não encontrado com este RA.');
        document.getElementById('pag-nome-aluno').value = '';
        document.getElementById('pag-aluno-id').value = '';
        document.getElementById('pag-curso').innerHTML = '<option value="">Buscar aluno primeiro</option>';
        return;
    }

    document.getElementById('pag-nome-aluno').value = aluno.nome;
    document.getElementById('pag-aluno-id').value = aluno.id;
    await carregarCursosDoAluno(aluno.id);
}

window.abrirModalEdicaoPagamento = async function (pagId) {
    const { data: pag, error } = await db
        .from('pagamentos')
        .select('*, alunos(nome, ra)')
        .eq('id', pagId)
        .single();

    if (error || !pag) {
        mostrarAlerta('Erro ao carregar pagamento para edição.');
        return;
    }

    document.getElementById('form-pagamento').reset();
    document.getElementById('pag-id').value = pag.id;
    document.getElementById('pag-aluno-id').value = pag.aluno_id;

    document.getElementById('pag-ra').value = pag.alunos ? pag.alunos.ra : '';
    document.getElementById('pag-nome-aluno').value = pag.alunos ? pag.alunos.nome : '';

    await carregarCursosDoAluno(pag.aluno_id);
    document.getElementById('pag-curso').value = pag.curso_id || '';

    document.getElementById('pag-valor').value = pag.valor_pago ? parseFloat(pag.valor_pago).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    document.getElementById('pag-forma').value = pag.forma_pagamento || '';
    document.getElementById('pag-data').value = pag.data_pagamento || '';
    document.getElementById('pag-status').value = pag.status || 'Pago';
    document.getElementById('pag-obs').value = pag.observacao || '';

    document.getElementById('modal-pagamento').classList.add('active');
}

function fecharModalPagamento() {
    document.getElementById('modal-pagamento').classList.remove('active');
}

async function carregarCursosDoAluno(alunoId) {
    const selectCurso = document.getElementById('pag-curso');
    selectCurso.innerHTML = '<option value="" disabled selected>⏳ Carregando cursos...</option>';
    selectCurso.disabled = true;

    if (!alunoId) {
        selectCurso.innerHTML = '<option value="">Selecione o aluno primeiro</option>';
        selectCurso.disabled = false;
        return;
    }

    const { data: matriculas, error } = await db
        .from('matriculas')
        .select('curso_id, cursos(nome)')
        .eq('aluno_id', alunoId);

    selectCurso.disabled = false;

    if (error) {
        console.error('Erro ao carregar cursos do aluno:', error);
        selectCurso.innerHTML = '<option value="">⚠️ Erro ao carregar cursos</option>';
        return;
    }

    selectCurso.innerHTML = '<option value="">Sem curso específico</option>';

    if (matriculas && matriculas.length > 0) {
        matriculas.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.curso_id;
            opt.textContent = m.cursos ? m.cursos.nome : m.curso_id;
            selectCurso.add(opt);
        });
    } else {
        const { data: aluno } = await db
            .from('alunos')
            .select('curso_id, curso_nome')
            .eq('id', alunoId)
            .single();
        if (aluno && aluno.curso_id) {
            const opt = document.createElement('option');
            opt.value = aluno.curso_id;
            opt.textContent = aluno.curso_nome || aluno.curso_id;
            selectCurso.add(opt);
        }
    }
}

async function registrarPagamento() {
    const pagId = document.getElementById('pag-id').value;
    const alunoId = document.getElementById('pag-aluno-id').value;
    const cursoId = document.getElementById('pag-curso').value;
    const valor = parseMoeda(document.getElementById('pag-valor').value);
    const forma = document.getElementById('pag-forma').value;
    const data = document.getElementById('pag-data').value;
    const status = document.getElementById('pag-status').value;
    const obs = document.getElementById('pag-obs').value.trim();

    if (!alunoId) { mostrarAlerta('Busque e selecione um aluno válido!'); return; }
    if (!forma) { mostrarAlerta('Selecione a forma de pagamento!'); return; }
    if (!data) { mostrarAlerta('Informe a data do pagamento!'); return; }
    if (isNaN(valor) || valor <= 0) { mostrarAlerta('Informe um valor válido (maior que zero)!'); return; }

    const btnSalvar = document.getElementById('btn-salvar-pagamento');
    const textoOriginal = btnSalvar.textContent;
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<span class="spinner"></span> Salvando...';

    let error = null;

    if (pagId) {
        // UPDATE
        const { error: errUpdate } = await db.from('pagamentos').update({
            curso_id: cursoId || null,
            valor_pago: valor,
            forma_pagamento: forma,
            data_pagamento: data,
            status: status,
            observacao: obs || null
        }).eq('id', pagId);
        error = errUpdate;
    } else {
        // INSERT
        const { error: errInsert } = await db.from('pagamentos').insert({
            aluno_id: alunoId,
            curso_id: cursoId || null,
            valor_pago: valor,
            forma_pagamento: forma,
            data_pagamento: data,
            status: status,
            observacao: obs || null,
            criado_por: usuarioLogado ? usuarioLogado.id : null
        });
        error = errInsert;
    }

    btnSalvar.disabled = false;
    btnSalvar.textContent = textoOriginal;

    if (error) {
        mostrarAlerta(`Erro ao registrar pagamento: ${error.message}`);
        return;
    }

    fecharModalPagamento();
    await carregarFinanceiro();
    await atualizarDashboard();
    mostrarAlerta('Pagamento registrado com sucesso! 💰', 'Sucesso');
}

window.estornarPagamento = async function (pagId) {
    mostrarConfirmacao(
        'Tem certeza que deseja estornar este pagamento? O status voltará para Pendente.',
        async () => {
            const { error } = await db.from('pagamentos').update({ status: 'Pendente' }).eq('id', pagId);
            if (error) {
                mostrarAlerta(`Erro ao estornar pagamento: ${error.message}`);
                return;
            }
            await carregarFinanceiro();
            await atualizarDashboard();
            mostrarAlerta('Pagamento estornado com sucesso!', 'Sucesso');
        }
    );
}

window.apagarPagamentoDefinitivo = async function (pagId) {
    mostrarConfirmacao(
        'Tem certeza absoluta que deseja apagar este pagamento? Esta ação é irreversível.',
        async () => {
            const { error } = await db.from('pagamentos').delete().eq('id', pagId);
            if (error) {
                mostrarAlerta(`Erro ao apagar pagamento: ${error.message}`);
                return;
            }
            await carregarFinanceiro();
            await atualizarDashboard();
            mostrarAlerta('Pagamento apagado com sucesso!', 'Sucesso');
        }
    );
}

// ==================== CADASTRO DE PROFESSOR ====================
function abrirModalProfessor() {
    document.getElementById('form-professor').reset();
    ocultarFeedbackProfessor();
    document.getElementById('modal-professor').classList.add('active');
}

function fecharModalProfessor() {
    document.getElementById('modal-professor').classList.remove('active');
    ocultarFeedbackProfessor();
}

function mostrarFeedbackProfessor(tipo, mensagem) {
    const el = document.getElementById('professor-feedback');
    el.className = `professor-feedback professor-feedback--${tipo}`;
    el.innerHTML = mensagem;
    el.style.display = 'flex';
}

function ocultarFeedbackProfessor() {
    const el = document.getElementById('professor-feedback');
    el.style.display = 'none';
    el.className = 'professor-feedback';
}

async function cadastrarProfessor() {
    const nome = document.getElementById('prof-nome').value.trim();
    const email = document.getElementById('prof-email').value.trim();
    const senha = document.getElementById('prof-senha').value;

    if (!nome || !email || !senha) {
        mostrarFeedbackProfessor('erro', '⚠️ Preencha todos os campos antes de continuar.');
        return;
    }
    if (senha.length < 6) {
        mostrarFeedbackProfessor('erro', '⚠️ A senha deve ter no mínimo 6 caracteres.');
        return;
    }

    const btnSalvar = document.getElementById('btn-salvar-professor');
    btnSalvar.disabled = true;
    mostrarFeedbackProfessor('loading',
        '<span class="spinner"></span> Criando conta do professor, aguarde...');

    const { data: authData, error: authError } = await db.auth.signUp({
        email,
        password: senha,
        options: {
            data: {
                nome: nome,
                tipo: 'professor'
            }
        }
    });

    btnSalvar.disabled = false;

    if (authError) {
        let mensagem = authError.message;
        if (
            mensagem.includes('already registered') ||
            mensagem.includes('already been registered') ||
            mensagem.includes('User already registered')
        ) {
            mensagem = 'Este e-mail já está cadastrado no sistema. Use outro e-mail.';
        }
        mostrarFeedbackProfessor('erro', `❌ ${mensagem}`);
        return;
    }

    if (!authData?.user?.id) {
        mostrarFeedbackProfessor('aviso',
            '✉️ Cadastro solicitado! Um e-mail de confirmação foi enviado ao professor. ' +
            'O perfil será criado automaticamente após a confirmação.');
        return;
    }

    mostrarFeedbackProfessor('sucesso',
        `✅ Professor <strong>${nome}</strong> cadastrado com sucesso! ` +
        `O acesso está pronto com o e-mail <strong>${email}</strong>.`);

    document.getElementById('form-professor').reset();
    setTimeout(() => {
        fecharModalProfessor();
    }, 3000);
}

// ==================== DISPARO DE AVISOS ====================
async function salvarAviso() {
    const btn = document.getElementById('btn-salvar-aviso');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Disparando...';
    }

    try {
        const titulo = document.getElementById('aviso-titulo').value.trim();
        const mensagem = document.getElementById('aviso-mensagem').value.trim();

        const tipoRadio = document.querySelector('input[name="tipo-aviso"]:checked');
        const tipo = tipoRadio ? tipoRadio.value : 'aluno';

        if (!titulo || !mensagem) {
            throw new Error('Por favor, preencha o título e a mensagem.');
        }

        if (tipo === 'aluno') {
            const aluno_ra = document.getElementById('aviso-ra').value.trim();
            if (!aluno_ra) throw new Error('Por favor, informe o RA do aluno.');

            const { error } = await db.from('avisos').insert({
                titulo,
                aluno_ra,
                mensagem,
                autor: usuarioLogado ? usuarioLogado.id : null
            });
            if (error) throw error;
            mostrarToastAdmin('Aviso disparado com sucesso para o aluno!', 'sucesso');

        } else {
            const turma = document.getElementById('aviso-turma').value;
            if (!turma) throw new Error('Por favor, selecione uma turma.');

            const { data: alunos, error: errMat } = await db.from('alunos')
                .select('ra, matriculas!inner(id)')
                .eq('matriculas.turma', turma);

            if (errMat) throw errMat;

            if (!alunos || alunos.length === 0) {
                throw new Error('Nenhum aluno encontrado nesta turma.');
            }

            const rasUnicos = [...new Set(alunos.map(a => a.ra).filter(Boolean))];

            if (rasUnicos.length === 0) {
                throw new Error('Os alunos desta turma não possuem RA válido.');
            }

            const avisosLote = rasUnicos.map(ra => ({
                titulo,
                aluno_ra: String(ra),
                mensagem,
                autor: usuarioLogado ? usuarioLogado.id : null
            }));

            const { error: errInsert } = await db.from('avisos').insert(avisosLote);
            if (errInsert) throw errInsert;

            mostrarToastAdmin(`Aviso enviado para ${rasUnicos.length} alunos da turma ${turma}!`, 'sucesso');
        }

        document.getElementById('form-aviso').reset();

        document.getElementById('aviso-ra').style.display = 'block';
        document.getElementById('aviso-ra').required = true;
        document.getElementById('aviso-turma').style.display = 'none';
        document.getElementById('aviso-turma').required = false;
        document.getElementById('label-aviso-destino').textContent = 'RA do Aluno Destino:';

    } catch (e) {
        console.error('Erro ao disparar aviso:', e);
        mostrarToastAdmin('Erro ao disparar aviso: ' + e.message, 'erro');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// Helper para Toast
function mostrarToastAdmin(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('toast-container-admin');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container-admin';
        container.style.position = 'fixed';
        container.style.bottom = '30px';
        container.style.right = '30px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.zIndex = '999999';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${tipo}`;
    toast.style.background = 'white';
    toast.style.padding = '15px 25px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '12px';
    toast.style.borderLeft = `5px solid ${tipo === 'sucesso' ? '#28a745' : '#dc3545'}`;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.4s ease';

    const icon = tipo === 'sucesso'
        ? '<span style="color: #28a745; font-size: 1.5em;">✔</span>'
        : '<span style="color: #dc3545; font-size: 1.5em;">⚠</span>';

    toast.innerHTML = `
        ${icon}
        <span style="font-weight: 500; font-size: 0.95em; color: #333;">${mensagem}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ==================== VINCULAR PROFESSOR ====================
async function carregarOpcoesVinculo() {
    try {
        const { data: professores, error: errProf } = await db.from('perfis').select('id, nome').eq('tipo', 'professor');
        if (errProf) throw errProf;

        const selectProf = document.getElementById('vinculo-professor');
        if (selectProf) {
            selectProf.innerHTML = '<option value="">Selecione um professor</option>' +
                (professores || []).map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
        }

        const { data: cursos, error: errCursos } = await db.from('cursos').select('id, nome');
        if (errCursos) throw errCursos;

        const selectCurso = document.getElementById('vinculo-curso');
        if (selectCurso) {
            selectCurso.innerHTML = '<option value="">Selecione um curso</option>' +
                (cursos || []).map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        }
    } catch (e) {
        console.error("Erro ao carregar opções de vínculo:", e);
    }
}

async function vincularProfessor() {
    const btn = document.getElementById('btn-vincular-professor');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Vinculando...';

    try {
        const professorId = document.getElementById('vinculo-professor')?.value;
        const cursoId = document.getElementById('vinculo-curso')?.value;
        const turmaInput = document.getElementById('vinculo-turma');
        const turma = turmaInput ? turmaInput.value.trim() : '';

        if (!professorId || !cursoId) {
            throw new Error("Selecione o professor e o curso.");
        }

        let query = db.from('turma_professores')
            .select('id')
            .eq('professor_id', professorId)
            .eq('curso_id', cursoId);

        if (turma) {
            query = query.eq('turma_nome', turma);
        } else {
            query = query.is('turma_nome', null);
        }

        const { data: existente, error: errCheck } = await query.maybeSingle();

        if (errCheck) throw new Error(`Erro ao verificar vínculo: ${errCheck.message}`);
        if (existente) throw new Error("Esse professor já está vinculado a essa turma/curso.");

        const { error } = await db.from('turma_professores').insert({
            professor_id: professorId,
            curso_id: cursoId,
            turma_nome: turma || null
        });

        if (error) throw new Error(`Erro de conexão ao salvar: ${error.message}`);

        mostrarToastAdmin("Professor vinculado com sucesso!", "sucesso");
        const formVinculo = document.getElementById('form-vinculo-professor');
        if (formVinculo) formVinculo.reset();
        await carregarVinculos();
    } catch (e) {
        console.error("Erro ao vincular:", e);
        mostrarToastAdmin(e.message, "erro");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function carregarVinculos() {
    try {
        const { data, error } = await db
            .from('turma_professores')
            .select(`
                id,
                turma_nome,
                perfis (nome),
                cursos (nome)
            `);

        if (error) throw error;

        const tbody = document.getElementById('lista-vinculos-professores');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--txt-mid);">Nenhum vínculo encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(v => {
            const prof = v.perfis ? v.perfis.nome : '-';
            const curso = v.cursos ? v.cursos.nome : '-';
            const turma = v.turma_nome || 'Todas as Turmas';
            return `
                <tr style="color: #333333; font-weight: 500;">
                    <td>${prof}</td>
                    <td>${curso}</td>
                    <td>${turma}</td>
                    <td>
                        <button class="btn-action" style="background: var(--vermelho); color: white;" onclick="removerVinculo('${v.id}')">Remover</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Erro ao carregar vínculos:", e);
        const tbody = document.getElementById('lista-vinculos-professores');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--vermelho);">Erro ao carregar vínculos.</td></tr>';
    }
}

window.removerVinculo = async function (id) {
    if (!confirm('Deseja realmente remover este vínculo?')) return;

    try {
        const { error } = await db.from('turma_professores').delete().eq('id', id);
        if (error) throw error;

        mostrarToastAdmin("Vínculo removido com sucesso!", "sucesso");
        await carregarVinculos();
    } catch (e) {
        console.error("Erro ao remover vínculo:", e);
        mostrarToastAdmin("Erro ao remover vínculo: " + e.message, "erro");
    }
}

// ==================== CARREGAR TURMAS ====================
async function carregarTurmasDisponiveis() {
    try {
        const { data, error } = await db.from('matriculas').select('turma');
        if (error) throw error;

        const turmasUnicas = [...new Set(data.map(d => d.turma).filter(Boolean))].sort();

        const optionsHTML = '<option value="">Selecione a Turma</option>' +
            turmasUnicas.map(t => `<option value="${t}">${t}</option>`).join('');

        const selectVinculo = document.getElementById('vinculo-turma');
        if (selectVinculo) {
            selectVinculo.innerHTML = '<option value="">Todas as Turmas (Geral)</option>' +
                turmasUnicas.map(t => `<option value="${t}">${t}</option>`).join('');
        }

        const selectAviso = document.getElementById('aviso-turma');
        if (selectAviso) {
            selectAviso.innerHTML = optionsHTML;
        }

        // Popular o select da Visão Geral de Turma
        const selectVisao = document.getElementById('visao-turma-select');
        if (selectVisao) {
            selectVisao.innerHTML = '<option value="">Selecione uma turma...</option>' +
                turmasUnicas.map(t => `<option value="${t}">${t}</option>`).join('');
        }
    } catch (e) {
        console.error("Erro ao carregar turmas:", e);
    }
}

// ==================== VISÃO GERAL DA TURMA (NOVA) ====================
async function carregarVisaoGeralTurma(turma) {
    turmaSelecionadaVisao = turma;
    const container = document.getElementById('visao-geral-turma');

    if (!turma) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'grid';

    // Carregar alunos da turma
    const tbodyAlunos = document.getElementById('visao-lista-alunos');
    tbodyAlunos.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--txt-light);"><span class="spinner"></span> Carregando...</td></tr>';

    try {
        const { data: matriculas, error: errMat } = await db
            .from('matriculas')
            .select('id, aluno_id, alunos(nome, cpf, ra)')
            .eq('turma', turma);

        if (errMat) throw errMat;

        if (!matriculas || matriculas.length === 0) {
            tbodyAlunos.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--txt-mid);">Nenhum aluno nesta turma</td></tr>';
        } else {
            tbodyAlunos.innerHTML = matriculas.map(m => {
                const nome = m.alunos ? m.alunos.nome : '-';
                const cpf = m.alunos ? (m.alunos.cpf || '-') : '-';
                return `
                    <tr style="color: #333333; font-weight: 500;">
                        <td><strong>${nome}</strong></td>
                        <td>${cpf}</td>
                        <td>
                            <button class="btn-action" style="background: var(--vermelho); color: white; font-size: 0.8em;" onclick="removerAlunoDaTurma('${m.id}')">Remover</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Erro ao carregar alunos da turma:', e);
        tbodyAlunos.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--vermelho);">Erro ao carregar</td></tr>';
    }

    // Carregar professores da turma
    const tbodyProfs = document.getElementById('visao-lista-professores');
    tbodyProfs.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--txt-light);"><span class="spinner"></span> Carregando...</td></tr>';

    try {
        const { data: vinculos, error: errVinc } = await db
            .from('turma_professores')
            .select('id, turma_nome, perfis(nome), cursos(nome)')
            .or(`turma_nome.eq.${turma},turma_nome.is.null`);

        if (errVinc) throw errVinc;

        if (!vinculos || vinculos.length === 0) {
            tbodyProfs.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--txt-mid);">Nenhum professor vinculado</td></tr>';
        } else {
            tbodyProfs.innerHTML = vinculos.map(v => {
                const nome = v.perfis ? v.perfis.nome : '-';
                const curso = v.cursos ? v.cursos.nome : '-';
                return `
                    <tr style="color: #333333; font-weight: 500;">
                        <td><strong>${nome}</strong></td>
                        <td>${curso}</td>
                        <td>
                            <button class="btn-action" style="background: var(--vermelho); color: white; font-size: 0.8em;" onclick="removerVinculo('${v.id}')">Desvincular</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Erro ao carregar professores da turma:', e);
        tbodyProfs.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--vermelho);">Erro ao carregar</td></tr>';
    }
}

// Adicionar aluno à turma via modal
async function abrirModalAddAlunoTurma() {
    if (!turmaSelecionadaVisao) return;

    document.getElementById('modal-add-aluno-turma-info').textContent = `Turma: ${turmaSelecionadaVisao}`;

    // Carregar alunos
    const selectAluno = document.getElementById('select-aluno-para-turma');
    selectAluno.innerHTML = '<option value="">Carregando...</option>';

    const { data: alunos } = await db.from('alunos').select('id, nome').order('nome');
    selectAluno.innerHTML = '<option value="">Selecione um aluno</option>' +
        (alunos || []).map(a => `<option value="${a.id}">${a.nome}</option>`).join('');

    // Carregar cursos
    const selectCurso = document.getElementById('select-curso-para-turma');
    const { data: cursos } = await db.from('cursos').select('id, nome').order('nome');
    selectCurso.innerHTML = '<option value="">Selecione um curso</option>' +
        (cursos || []).map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    document.getElementById('modal-add-aluno-turma').classList.add('active');
}

function fecharModalAddAlunoTurma() {
    document.getElementById('modal-add-aluno-turma').classList.remove('active');
}

async function confirmarAddAlunoTurma() {
    const alunoId = document.getElementById('select-aluno-para-turma').value;
    const cursoId = document.getElementById('select-curso-para-turma').value;

    if (!alunoId || !cursoId) {
        mostrarAlerta('Selecione o aluno e o curso.');
        return;
    }

    try {
        const { error } = await db.from('matriculas').insert({
            aluno_id: alunoId,
            curso_id: cursoId,
            turma: turmaSelecionadaVisao,
            data_matricula: new Date().toISOString().split('T')[0],
            criado_por: usuarioLogado.id
        });

        if (error) throw error;

        fecharModalAddAlunoTurma();
        mostrarToastAdmin('Aluno adicionado à turma com sucesso!', 'sucesso');
        await carregarVisaoGeralTurma(turmaSelecionadaVisao);
    } catch (e) {
        mostrarAlerta(`Erro ao adicionar aluno: ${e.message}`);
    }
}

// Vincular professor à turma via modal
async function abrirModalVincularProfTurma() {
    if (!turmaSelecionadaVisao) return;

    document.getElementById('modal-vincular-prof-turma-info').textContent = `Turma: ${turmaSelecionadaVisao}`;

    // Carregar professores
    const selectProf = document.getElementById('select-prof-para-turma');
    selectProf.innerHTML = '<option value="">Carregando...</option>';

    const { data: professores } = await db.from('perfis').select('id, nome').eq('tipo', 'professor');
    selectProf.innerHTML = '<option value="">Selecione um professor</option>' +
        (professores || []).map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

    // Carregar cursos
    const selectCurso = document.getElementById('select-curso-prof-turma');
    const { data: cursos } = await db.from('cursos').select('id, nome').order('nome');
    selectCurso.innerHTML = '<option value="">Selecione um curso</option>' +
        (cursos || []).map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    document.getElementById('modal-vincular-prof-turma').classList.add('active');
}

function fecharModalVincularProfTurma() {
    document.getElementById('modal-vincular-prof-turma').classList.remove('active');
}

async function confirmarVincularProfTurma() {
    const professorId = document.getElementById('select-prof-para-turma').value;
    const cursoId = document.getElementById('select-curso-prof-turma').value;

    if (!professorId || !cursoId) {
        mostrarAlerta('Selecione o professor e o curso.');
        return;
    }

    try {
        const { error } = await db.from('turma_professores').insert({
            professor_id: professorId,
            curso_id: cursoId,
            turma_nome: turmaSelecionadaVisao
        });

        if (error) throw error;

        fecharModalVincularProfTurma();
        mostrarToastAdmin('Professor vinculado à turma com sucesso!', 'sucesso');
        await carregarVisaoGeralTurma(turmaSelecionadaVisao);
        await carregarVinculos();
    } catch (e) {
        mostrarAlerta(`Erro ao vincular professor: ${e.message}`);
    }
}

window.removerAlunoDaTurma = async function (matriculaId) {
    if (!confirm('Deseja remover este aluno desta turma?')) return;

    try {
        const { error } = await db.from('matriculas').delete().eq('id', matriculaId);
        if (error) throw error;

        mostrarToastAdmin('Aluno removido da turma!', 'sucesso');
        await carregarVisaoGeralTurma(turmaSelecionadaVisao);
    } catch (e) {
        mostrarAlerta('Erro ao remover: ' + e.message);
    }
}

// ==================== EVENT LISTENERS ====================
function configurarEventos() {
    const btnSair = document.getElementById('sair');
    if (btnSair) btnSair.addEventListener('click', sairSistema);

    const btnSalvarCurso = document.getElementById('btn-salvar-curso');
    if (btnSalvarCurso) btnSalvarCurso.addEventListener('click', salvarCurso);

    const btnSalvarDisciplina = document.getElementById('btn-salvar-disciplina');
    if (btnSalvarDisciplina) btnSalvarDisciplina.addEventListener('click', salvarDisciplina);

    const btnMatricular = document.getElementById('btn-matricular');
    if (btnMatricular) btnMatricular.addEventListener('click', matricularAluno);

    const btnSalvarAviso = document.getElementById('btn-salvar-aviso');
    if (btnSalvarAviso) btnSalvarAviso.addEventListener('click', salvarAviso);

    const btnVincular = document.getElementById('btn-vincular-professor');
    if (btnVincular) btnVincular.addEventListener('click', vincularProfessor);

    const radiosTipoAviso = document.querySelectorAll('input[name="tipo-aviso"]');
    radiosTipoAviso.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isTurma = e.target.value === 'turma';
            const inputRa = document.getElementById('aviso-ra');
            const selectTurma = document.getElementById('aviso-turma');
            const labelDestino = document.getElementById('label-aviso-destino');

            if (isTurma) {
                if (inputRa) inputRa.style.display = 'none';
                if (inputRa) inputRa.required = false;
                if (selectTurma) selectTurma.style.display = 'block';
                if (selectTurma) selectTurma.required = true;
                if (labelDestino) labelDestino.textContent = 'Turma Destino:';
            } else {
                if (inputRa) inputRa.style.display = 'block';
                if (inputRa) inputRa.required = true;
                if (selectTurma) selectTurma.style.display = 'none';
                if (selectTurma) selectTurma.required = false;
                if (labelDestino) labelDestino.textContent = 'RA do Aluno Destino:';
            }
        });
    });

    document.getElementById('forma-pagamento')?.addEventListener('change', function () {
        const containerParcelas = document.getElementById('parcelas-container');
        const containerMetodoA = document.getElementById('metodo-pagamento-container');
        const containerMetodoP = document.getElementById('metodo-parcelamento-container');
        if (containerParcelas) containerParcelas.style.display = this.value === 'parcelado' ? 'flex' : 'none';
        if (containerMetodoP) containerMetodoP.style.display = this.value === 'parcelado' ? 'flex' : 'none';
        if (containerMetodoA) containerMetodoA.style.display = this.value === 'a-vista' ? 'flex' : 'none';
    });

    document.getElementById('curso-crm')?.addEventListener('change', carregarAlunos);
    document.getElementById('turma-crm')?.addEventListener('input', carregarAlunos);

    document.getElementById('curso-diario')?.addEventListener('change', carregarAlunosDiario);
    document.getElementById('turma-diario')?.addEventListener('input', carregarAlunosDiario);

    document.getElementById('btn-salvar-edicao')?.addEventListener('click', salvarEdicaoAluno);

    document.getElementById('btn-confirmar-action')?.addEventListener('click', confirmarAcao);

    // --- Modal de Professor ---
    document.getElementById('btn-abrir-modal-professor')?.addEventListener('click', abrirModalProfessor);
    document.getElementById('btn-salvar-professor')?.addEventListener('click', cadastrarProfessor);

    // Toggle mostrar/ocultar senha
    document.getElementById('btn-toggle-senha')?.addEventListener('click', function () {
        const input = document.getElementById('prof-senha');
        if (input.type === 'password') {
            input.type = 'text';
            this.textContent = '🙈';
        } else {
            input.type = 'password';
            this.textContent = '👁';
        }
    });

    // --- Módulo Financeiro ---
    document.getElementById('btn-novo-pagamento')?.addEventListener('click', abrirModalPagamento);
    document.getElementById('btn-salvar-pagamento')?.addEventListener('click', registrarPagamento);

    document.getElementById('pag-aluno')?.addEventListener('change', function () {
        carregarCursosDoAluno(this.value);
    });

    document.getElementById('fin-busca')?.addEventListener('input', filtrarPagamentos);
    document.getElementById('fin-filtro-curso')?.addEventListener('change', filtrarPagamentos);
    document.getElementById('fin-filtro-forma')?.addEventListener('change', filtrarPagamentos);
    document.getElementById('fin-filtro-status')?.addEventListener('change', filtrarPagamentos);

    // --- Múltiplos Cursos e Máscara de moeda ---
    document.getElementById('btn-add-curso')?.addEventListener('click', adicionarLinhaCurso);
    document.querySelector('.valor-input')?.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });

    document.getElementById('pag-valor')?.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });

    // --- Visão Geral da Turma ---
    document.getElementById('visao-turma-select')?.addEventListener('change', function () {
        carregarVisaoGeralTurma(this.value);
    });

    document.getElementById('btn-add-aluno-turma')?.addEventListener('click', abrirModalAddAlunoTurma);
    document.getElementById('btn-confirmar-add-aluno-turma')?.addEventListener('click', confirmarAddAlunoTurma);

    document.getElementById('btn-vincular-prof-turma')?.addEventListener('click', abrirModalVincularProfTurma);
    document.getElementById('btn-confirmar-vincular-prof-turma')?.addEventListener('click', confirmarVincularProfTurma);
}

function adicionarLinhaCurso() {
    const container = document.getElementById('cursos-container');
    const template = container.querySelector('.curso-entry').cloneNode(true);

    template.querySelector('.curso-select').value = '';
    template.querySelector('.turma-input').value = '';
    const valorInput = template.querySelector('.valor-input');
    valorInput.value = '';
    valorInput.addEventListener('input', function () {
        aplicarMascaraMoeda(this);
    });

    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.textContent = '🗑️ Remover';
    btnRemover.style.cssText = 'background: transparent; border: none; color: var(--txt-mid); cursor: pointer; font-size: 0.85em; font-weight: 600; padding-bottom: 12px; transition: var(--t-fast); height: 48px;';
    btnRemover.onmouseover = () => { btnRemover.style.color = 'var(--vermelho)'; btnRemover.style.textDecoration = 'underline'; };
    btnRemover.onmouseout = () => { btnRemover.style.color = 'var(--txt-mid)'; btnRemover.style.textDecoration = 'none'; };
    btnRemover.onclick = () => template.remove();
    template.appendChild(btnRemover);

    container.appendChild(template);
}

// ==================== FICHA CADASTRAL (ONBOARDING) ====================
async function abrirFichaCadastral(alunoId) {
    try {
        const { data: aluno, error } = await db
            .from('alunos')
            .select(`
                *,
                matriculas(
                    cursos(nome)
                )
            `)
            .eq('id', alunoId)
            .single();

        if (error) throw error;
        if (!aluno) throw new Error('Aluno não encontrado.');

        // Status
        const statusEl = document.getElementById('ficha-status-preenchimento');
        const possuiOnboarding = aluno.cep || aluno.telefone || aluno.logradouro;

        if (possuiOnboarding) {
            statusEl.textContent = '✅ Ficha cadastral preenchida pelo aluno.';
            statusEl.style.color = '#10b981'; // green
        } else {
            statusEl.textContent = '⚠️ Pendente de preenchimento pelo aluno no onboarding.';
            statusEl.style.color = '#f59e0b'; // yellow/orange
        }

        // Cursos
        const matriculas = aluno.matriculas || [];
        let cursosTexto = '-';
        if (matriculas.length > 0) {
            cursosTexto = matriculas.map(m => m.cursos ? m.cursos.nome : '').filter(Boolean).join(', ');
        } else if (aluno.curso_nome) {
            cursosTexto = aluno.curso_nome;
        }

        // Preenche campos, validando se são nulos
        const preencher = (id, valor) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = valor ? valor : 'Pendente';
                el.style.color = '#1f2937';
                el.style.fontWeight = '500';
            }
        };

        preencher('ficha-nome', aluno.nome);
        preencher('ficha-ra', aluno.ra);
        preencher('ficha-cpf', aluno.cpf);
        preencher('ficha-curso', cursosTexto);

        preencher('ficha-telefone', aluno.telefone);
        preencher('ficha-telefone-sec', aluno.telefone_secundario);
        preencher('ficha-email', aluno.email);

        preencher('ficha-cep', aluno.cep);
        preencher('ficha-logradouro', aluno.logradouro);
        preencher('ficha-numero', aluno.numero);
        preencher('ficha-bairro', aluno.bairro);
        preencher('ficha-cidade-uf', aluno.cidade_uf);

        // Abre modal
        document.getElementById('modal-ficha-cadastral').classList.add('active');
    } catch (e) {
        console.error('Erro ao abrir ficha cadastral:', e);
        mostrarAlerta('Não foi possível carregar a ficha do aluno: ' + e.message, 'Erro');
    }
}

function fecharFichaCadastral() {
    document.getElementById('modal-ficha-cadastral').classList.remove('active');
}
