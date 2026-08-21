// ============================================================
// MIND RECALL — script-professor.js
// Script ISOLADO do Portal do Professor.
// Nenhuma variável compartilhada com script-secretaria.js.
// ============================================================

const SUPABASE_URL = 'https://gijgocyrumhalzqhkggj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SBbgOvJCx21UjRJucquDTQ_kWhEL8Nx';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ==================== VARIÁVEIS DO ESCOPO PROFESSOR ====================
let professorLogado = null;      // { id, email, nome, tipo }
let minhasTurmas = [];           // turmas vinculadas ao professor
let matriculaNotasId = null;     // ID da matrícula no modal de notas

// ==================== INICIALIZAÇÃO COM GUARDA DE ROTA ====================
document.addEventListener('DOMContentLoaded', async function () {
    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Verifica se o tipo é 'professor'
    const { data: perfil, error } = await db
        .from('perfis')
        .select('nome, tipo')
        .eq('id', session.user.id)
        .single();

    if (error || !perfil || perfil.tipo !== 'professor') {
        await db.auth.signOut();
        window.location.href = 'index.html';
        return;
    }

    professorLogado = { id: session.user.id, email: session.user.email, ...perfil };

    // Preenche UI com dados do professor
    const nameEl = document.getElementById('prof-user-name');
    if (nameEl) nameEl.textContent = perfil.nome || 'Professor';

    const emailEl = document.getElementById('prof-user-email');
    if (emailEl) emailEl.textContent = session.user.email;

    const avatarEl = document.getElementById('prof-avatar');
    if (avatarEl && perfil.nome) avatarEl.textContent = perfil.nome.charAt(0).toUpperCase();

    const welcomeEl = document.getElementById('prof-welcome-name');
    if (welcomeEl) welcomeEl.textContent = perfil.nome || 'Professor';

    configurarEventosProfessor();
    await carregarDadosProfessor();

    // Ouve logout
    db.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
            professorLogado = null;
            window.location.href = 'index.html';
        }
    });
});

// ==================== AUTENTICAÇÃO ====================
async function sairSistema() {
    await db.auth.signOut();
    window.location.href = 'index.html';
}

// ==================== NAVEGAÇÃO POR ABAS ====================
function openProfTab(tabId) {
    // Oculta todas as tabs
    document.querySelectorAll('.prof-tabcontent').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    // Remove active de todos os itens do menu
    document.querySelectorAll('.prof-nav-item').forEach(el => {
        el.classList.remove('active');
    });

    // Mostra tab selecionada
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.style.display = 'block';
        tab.classList.add('active');
    }

    // Marca item ativo
    const navItem = document.querySelector(`.prof-nav-item[data-tab="${tabId}"]`);
    if (navItem) navItem.classList.add('active');

    // Ações ao navegar
    if (tabId === 'prof-diario') carregarDiarioProfessor();
}

// ==================== CARREGAR DADOS DO PROFESSOR ====================
async function carregarDadosProfessor() {
    try {
        // Busca vínculos do professor
        const { data: vinculos, error } = await db
            .from('turma_professores')
            .select('id, turma_nome, curso_id, cursos(nome)')
            .eq('professor_id', professorLogado.id);

        if (error) throw error;

        minhasTurmas = vinculos || [];

        // Atualiza estatísticas do dashboard
        const turmasUnicas = [...new Set(minhasTurmas.map(v => v.turma_nome).filter(Boolean))];
        const cursosUnicos = [...new Set(minhasTurmas.map(v => v.curso_id))];

        document.getElementById('prof-total-turmas').textContent = turmasUnicas.length;
        document.getElementById('prof-total-cursos').textContent = cursosUnicos.length;

        // Conta alunos nas turmas do professor
        let totalAlunos = 0;
        for (const turma of turmasUnicas) {
            const { count } = await db
                .from('matriculas')
                .select('*', { count: 'exact', head: true })
                .eq('turma', turma);
            totalAlunos += (count || 0);
        }
        // Para turmas genéricas (null), conta por curso
        const turmasGenericas = minhasTurmas.filter(v => !v.turma_nome);
        for (const v of turmasGenericas) {
            const { count } = await db
                .from('matriculas')
                .select('*', { count: 'exact', head: true })
                .eq('curso_id', v.curso_id);
            totalAlunos += (count || 0);
        }

        document.getElementById('prof-total-alunos').textContent = totalAlunos;

        // Renderiza turmas no dashboard (cards rápidos)
        renderizarTurmasRapidas(turmasUnicas);

        // Popular selects de turma
        popularSelectsTurma(turmasUnicas);

    } catch (e) {
        console.error('Erro ao carregar dados do professor:', e);
    }
}

function renderizarTurmasRapidas(turmas) {
    const container = document.getElementById('prof-lista-turmas-rapida');
    if (!container) return;

    if (turmas.length === 0) {
        container.innerHTML = '<p style="color: var(--txt-navy-sub);">Nenhuma turma vinculada ao seu perfil.</p>';
        return;
    }

    container.innerHTML = turmas.map(turma => {
        // Encontra os cursos dessa turma
        const cursosDestaTurma = minhasTurmas
            .filter(v => v.turma_nome === turma)
            .map(v => v.cursos ? v.cursos.nome : '-');
        const cursosUnicos = [...new Set(cursosDestaTurma)];

        return `
            <div class="prof-turma-card" onclick="abrirTurmaRapida('${turma}')">
                <div class="prof-turma-card-header">
                    <span class="prof-turma-card-icon">📚</span>
                    <strong>${turma}</strong>
                </div>
                <div class="prof-turma-card-body">
                    <span class="prof-turma-card-curso">${cursosUnicos.join(', ')}</span>
                </div>
                <div class="prof-turma-card-footer">
                    <span>Ver alunos →</span>
                </div>
            </div>
        `;
    }).join('');
}

function popularSelectsTurma(turmas) {
    const selects = [
        document.getElementById('prof-turma-select'),
        document.getElementById('prof-diario-turma'),
        document.getElementById('prof-aviso-turma')
    ].filter(Boolean);

    selects.forEach(select => {
        const firstOption = select.options[0].text;
        select.innerHTML = `<option value="">${firstOption}</option>` +
            turmas.map(t => `<option value="${t}">${t}</option>`).join('');
    });
}

// Atalho para abrir turma pelo card do dashboard
window.abrirTurmaRapida = function (turma) {
    openProfTab('prof-turmas');
    const select = document.getElementById('prof-turma-select');
    if (select) {
        select.value = turma;
        carregarAlunosDaTurma(turma);
    }
}

// ==================== MINHAS TURMAS ====================
async function carregarAlunosDaTurma(turma) {
    const container = document.getElementById('prof-turma-alunos-container');
    const tbody = document.getElementById('prof-lista-alunos-turma');
    const titulo = document.getElementById('prof-turma-titulo');

    if (!turma) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    titulo.textContent = `Alunos da Turma: ${turma}`;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--txt-light);"><span class="spinner"></span> Carregando...</td></tr>';

    try {
        const { data: matriculas, error } = await db
            .from('matriculas')
            .select('id, turma, alunos(nome, cpf, ra), cursos(nome)')
            .eq('turma', turma);

        if (error) throw error;

        if (!matriculas || matriculas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--txt-mid);">Nenhum aluno encontrado nesta turma.</td></tr>';
            return;
        }

        tbody.innerHTML = matriculas.map(m => {
            const nome = m.alunos ? m.alunos.nome : '-';
            const cpf = m.alunos ? (m.alunos.cpf || '-') : '-';
            const curso = m.cursos ? m.cursos.nome : '-';
            const ra = m.alunos ? (m.alunos.ra || '-') : '-';

            return `
                <tr>
                    <td><strong>${nome}</strong></td>
                    <td>${cpf}</td>
                    <td>${curso}</td>
                    <td>${ra}</td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error('Erro ao carregar alunos da turma:', e);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--vermelho);">Erro ao carregar alunos.</td></tr>';
    }
}

// ==================== DIÁRIO DE CLASSE ====================
async function carregarDiarioProfessor() {
    const tbody = document.getElementById('prof-lista-diario');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--txt-light);"><span class="spinner"></span> Carregando...</td></tr>';

    try {
        // Busca turmas do professor
        const turmasDoProf = minhasTurmas.map(v => v.turma_nome).filter(Boolean);
        const cursosDoProf = minhasTurmas.filter(v => !v.turma_nome).map(v => v.curso_id);

        if (turmasDoProf.length === 0 && cursosDoProf.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--txt-mid);">Nenhuma turma vinculada.</td></tr>';
            return;
        }

        // Busca matrículas das turmas do professor
        let allMatriculas = [];

        if (turmasDoProf.length > 0) {
            const { data: matTurmas, error: errT } = await db
                .from('matriculas')
                .select('*, alunos(nome, cpf, ra), cursos(nome)')
                .in('turma', turmasDoProf);
            if (errT) throw errT;
            allMatriculas = allMatriculas.concat(matTurmas || []);
        }

        if (cursosDoProf.length > 0) {
            const { data: matCursos, error: errC } = await db
                .from('matriculas')
                .select('*, alunos(nome, cpf, ra), cursos(nome)')
                .in('curso_id', cursosDoProf);
            if (errC) throw errC;
            // Evita duplicatas
            const idsExistentes = new Set(allMatriculas.map(m => m.id));
            (matCursos || []).forEach(m => {
                if (!idsExistentes.has(m.id)) allMatriculas.push(m);
            });
        }

        // Aplicar filtros
        const filtroTurma = document.getElementById('prof-diario-turma')?.value || '';
        const filtroBusca = (document.getElementById('prof-diario-busca')?.value || '').toLowerCase().trim();

        let filtrados = allMatriculas;

        if (filtroTurma) {
            filtrados = filtrados.filter(m => m.turma === filtroTurma);
        }

        if (filtroBusca) {
            filtrados = filtrados.filter(m => {
                const nomeAluno = (m.alunos?.nome || '').toLowerCase();
                const raAluno = m.alunos?.ra ? String(m.alunos.ra) : '';
                return nomeAluno.includes(filtroBusca) || raAluno.includes(filtroBusca);
            });
        }

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--txt-mid);">Nenhum aluno encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = filtrados.map(m => {
            const nomeAluno = m.alunos ? m.alunos.nome : '-';
            const nomeCurso = m.cursos ? m.cursos.nome : '-';

            const n1 = m.nota1 !== null && m.nota1 !== undefined ? m.nota1 : null;
            const n2 = m.nota2 !== null && m.nota2 !== undefined ? m.nota2 : null;
            const media = m.media !== null && m.media !== undefined ? m.media : null;

            const status = media !== null ? (media >= 7 ? 'Aprovado' : 'Em Recuperação') : '-';
            const badgeClass = media !== null ? (media >= 7 ? 'badge-aprovado' : 'badge-recuperacao') : '';

            return `
                <tr>
                    <td>${nomeAluno}</td>
                    <td>${nomeCurso}</td>
                    <td>${m.turma || '-'}</td>
                    <td>${n1 !== null ? n1 : '-'}</td>
                    <td>${n2 !== null ? n2 : '-'}</td>
                    <td><strong>${media !== null ? parseFloat(media).toFixed(1) : '-'}</strong></td>
                    <td>${media !== null ? `<span class="badge ${badgeClass}">${status}</span>` : '-'}</td>
                    <td>
                        <button type="button" class="btn-action" onclick="abrirModalNotasProf('${m.id}', '${nomeAluno.replace(/'/g, "\\'")}', '${nomeCurso.replace(/'/g, "\\'")}')">Lançar Notas</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        console.error('Erro ao carregar diário:', e);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--vermelho);">Erro ao carregar diário.</td></tr>';
    }
}

// ==================== MODAL DE NOTAS (PROFESSOR) ====================
window.abrirModalNotasProf = async function (matriculaId, nomeAluno, nomeCurso) {
    const { data: matricula } = await db
        .from('matriculas')
        .select('nota1, nota2')
        .eq('id', matriculaId)
        .single();

    matriculaNotasId = matriculaId;
    document.getElementById('prof-matricula-id-notas').value = matriculaId;

    const subtitle = document.getElementById('prof-notas-subtitle');
    if (subtitle) {
        subtitle.innerHTML = `<strong>Aluno:</strong> ${nomeAluno} &nbsp;|&nbsp; <strong>Curso:</strong> ${nomeCurso}`;
    }

    document.getElementById('prof-nota1-input').value = matricula && matricula.nota1 !== null ? matricula.nota1 : '';
    document.getElementById('prof-nota2-input').value = matricula && matricula.nota2 !== null ? matricula.nota2 : '';
    document.getElementById('prof-modal-notas').classList.add('active');
}

function fecharModalNotasProf() {
    document.getElementById('prof-modal-notas').classList.remove('active');
    matriculaNotasId = null;
}

async function salvarNotasProf() {
    if (matriculaNotasId === null) return;

    const nota1Str = document.getElementById('prof-nota1-input').value;
    const nota2Str = document.getElementById('prof-nota2-input').value;

    if (nota1Str === '' || nota2Str === '') {
        mostrarAlerta('Preencha os dois campos de notas!');
        return;
    }

    const n1 = parseFloat(nota1Str);
    const n2 = parseFloat(nota2Str);

    const { error } = await db
        .from('matriculas')
        .update({ nota1: n1, nota2: n2 })
        .eq('id', matriculaNotasId);

    if (error) {
        mostrarAlerta(`Erro ao salvar notas: ${error.message}`);
        return;
    }

    fecharModalNotasProf();
    await carregarDiarioProfessor();
    mostrarAlerta('Notas salvas com sucesso!', 'Sucesso');
}

// ==================== DISPARO DE AVISOS (PROFESSOR) ====================
async function enviarAvisoProfessor() {
    const btn = document.getElementById('prof-btn-enviar-aviso');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Disparando...';
    }

    try {
        const titulo = document.getElementById('prof-aviso-titulo').value.trim();
        const mensagem = document.getElementById('prof-aviso-mensagem').value.trim();

        const tipoRadio = document.querySelector('input[name="prof-tipo-aviso"]:checked');
        const tipo = tipoRadio ? tipoRadio.value : 'aluno';

        if (!titulo || !mensagem) {
            throw new Error('Preencha o título e a mensagem.');
        }

        if (tipo === 'aluno') {
            const aluno_ra = document.getElementById('prof-aviso-ra').value.trim();
            if (!aluno_ra) throw new Error('Informe o RA do aluno.');

            const { error } = await db.from('avisos').insert({
                titulo,
                aluno_ra,
                mensagem,
                autor: professorLogado.id
            });
            if (error) throw error;
            mostrarToast('Aviso enviado com sucesso!', 'sucesso');

        } else {
            const turma = document.getElementById('prof-aviso-turma').value;
            if (!turma) throw new Error('Selecione uma turma.');

            // Busca alunos dessa turma
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
                autor: professorLogado.id
            }));

            const { error: errInsert } = await db.from('avisos').insert(avisosLote);
            if (errInsert) throw errInsert;

            mostrarToast(`Aviso enviado para ${rasUnicos.length} alunos da turma ${turma}!`, 'sucesso');
        }

        document.getElementById('prof-form-aviso').reset();

        // Reset UI
        document.getElementById('prof-aviso-ra').style.display = 'block';
        document.getElementById('prof-aviso-ra').required = true;
        document.getElementById('prof-aviso-turma').style.display = 'none';
        document.getElementById('prof-aviso-turma').required = false;
        document.getElementById('prof-label-aviso-destino').textContent = 'RA do Aluno:';

    } catch (e) {
        console.error('Erro ao disparar aviso:', e);
        mostrarToast('Erro: ' + e.message, 'erro');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ==================== MODAIS E UTILITÁRIOS ====================
function mostrarAlerta(mensagem, titulo = 'Atenção') {
    document.getElementById('alerta-titulo').textContent = titulo;
    document.getElementById('alerta-mensagem').textContent = mensagem;
    document.getElementById('modal-alerta').classList.add('active');
}

function fecharModalAlerta() {
    document.getElementById('modal-alerta').classList.remove('active');
}

function mostrarToast(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('prof-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'prof-toast-container';
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

    toast.innerHTML = `${icon}<span style="font-weight: 500; font-size: 0.95em; color: #333;">${mensagem}</span>`;

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

// ==================== EVENT LISTENERS ====================
function configurarEventosProfessor() {
    // Logout
    document.getElementById('prof-btn-sair')?.addEventListener('click', sairSistema);

    // Navegação sidebar
    document.querySelectorAll('.prof-nav-item').forEach(item => {
        item.addEventListener('click', function () {
            const tabId = this.dataset.tab;
            if (tabId) openProfTab(tabId);
        });
    });

    // Selecionar turma
    document.getElementById('prof-turma-select')?.addEventListener('change', function () {
        carregarAlunosDaTurma(this.value);
    });

    // Filtros do diário
    document.getElementById('prof-diario-turma')?.addEventListener('change', carregarDiarioProfessor);
    document.getElementById('prof-diario-busca')?.addEventListener('input', carregarDiarioProfessor);

    // Salvar notas
    document.getElementById('prof-btn-salvar-notas')?.addEventListener('click', salvarNotasProf);

    // Avisos — tipo de destinatário
    const radiosTipoAviso = document.querySelectorAll('input[name="prof-tipo-aviso"]');
    radiosTipoAviso.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isTurma = e.target.value === 'turma';
            const inputRa = document.getElementById('prof-aviso-ra');
            const selectTurma = document.getElementById('prof-aviso-turma');
            const labelDestino = document.getElementById('prof-label-aviso-destino');

            if (isTurma) {
                if (inputRa) { inputRa.style.display = 'none'; inputRa.required = false; }
                if (selectTurma) { selectTurma.style.display = 'block'; selectTurma.required = true; }
                if (labelDestino) labelDestino.textContent = 'Turma Destino:';
            } else {
                if (inputRa) { inputRa.style.display = 'block'; inputRa.required = true; }
                if (selectTurma) { selectTurma.style.display = 'none'; selectTurma.required = false; }
                if (labelDestino) labelDestino.textContent = 'RA do Aluno:';
            }
        });
    });

    // Enviar aviso
    document.getElementById('prof-btn-enviar-aviso')?.addEventListener('click', enviarAvisoProfessor);
}
