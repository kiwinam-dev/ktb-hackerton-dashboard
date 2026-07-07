import React, { useState, useEffect, useMemo } from 'react';
import {
	ArrowLeft, Users, Trophy, CheckCircle2, Clock,
	Calendar, ChevronRight, RefreshCw, Shield, Lock,
	Eye, Play, FileText, Check, AlertCircle, Download,
	Settings, Edit2, Trash2, Save, X, KeyRound, ChevronUp, ChevronDown,
	Vote, ToggleLeft, ToggleRight, Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
	getStudentsByGeneration,
	getMatchupsByGeneration,
	syncVotingData,
	getVoterVotes,
	getVotesByGeneration,
	getGenerations,
	verifySystemPassword,
	verifyAdminPassword,
	updateGeneration,
	deleteGeneration,
	updateSystemPassword,
	updateAdminPassword,
	adminDeleteProject,
	adminUpdateProjectPassword,
	getVotingSettings,
	saveVotingSettings,
	updateProject,
	db
} from '../lib/firebase';

const AdminDashboard = ({ projects, onBackToGallery, showToast }) => {
	// Auth State
	const [isAuthorized, setIsAuthorized] = useState(() => {
		return sessionStorage.getItem('ktb_admin_auth') === 'true';
	});
	const [systemPassword, setSystemPassword] = useState('');
	const [authError, setAuthError] = useState('');
	const [authLoading, setAuthLoading] = useState(false);

	// Dashboard State
	const [generations, setGenerations] = useState([]);
	const [selectedGen, setSelectedGen] = useState(4);
	const [students, setStudents] = useState([]);
	const [matchups, setMatchups] = useState([]);
	const [dataLoading, setDataLoading] = useState(false);
	const [selectedStudentVotes, setSelectedStudentVotes] = useState([]);
	const [loadingStudentVotes, setLoadingStudentVotes] = useState(false);
	const [syncLoading, setSyncLoading] = useState(false);
	const [selectedStudent, setSelectedStudent] = useState(null); // Selected student for detailed votes view

	// Search and Filter State
	const [searchTerm, setSearchTerm] = useState('');
	const [filterCourse, setFilterCourse] = useState('all');
	const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'completed' | 'in_progress' | 'no_vote'

	// Project Win Rate States
	const [activeSubTab, setActiveSubTab] = useState('voters'); // 'voters' | 'projects'
	const [projectSearchTerm, setProjectSearchTerm] = useState('');
	const [projectSortBy, setProjectSortBy] = useState('winRateDesc'); // 'winRateDesc' | 'winRateAsc' | 'matchesDesc' | 'title'
	const [selectedProject, setSelectedProject] = useState(null); // Selected project for H2H breakdown
	const [projectViewMode, setProjectViewMode] = useState('list'); // 'list' | 'matrix'

	// 1. 갤러리 기수 수정
	const [localGenerations, setLocalGenerations] = useState([]);
	const [genSaving, setGenSaving] = useState(false);
	const [newGenName, setNewGenName] = useState('');
	const [newGenValue, setNewGenValue] = useState('');

	// 2. 입장 비밀번호 수정
	const [currentPw, setCurrentPw] = useState('');
	const [newPw, setNewPw] = useState('');
	const [confirmPw, setConfirmPw] = useState('');
	const [pwChanging, setPwChanging] = useState(false);
	const [pwError, setPwError] = useState('');

	// 2-2. 관리자 어드민 비밀번호 수정
	const [currentAdminPw, setCurrentAdminPw] = useState('');
	const [newAdminPw, setNewAdminPw] = useState('');
	const [confirmAdminPw, setConfirmAdminPw] = useState('');
	const [adminPwChanging, setAdminPwChanging] = useState(false);
	const [adminPwError, setAdminPwError] = useState('');

	// 3. 프로젝트 관리
	const [projectEditTarget, setProjectEditTarget] = useState(null);
	const [projectEditData, setProjectEditData] = useState({});
	const [projectEditNewPw, setProjectEditNewPw] = useState('');
	const [projectSaving, setProjectSaving] = useState(false);

	// 4. 투표 관리
	const [adminVotingSettings, setAdminVotingSettings] = useState({ isActive: false, generation: 4, startDate: '' });
	const [votingSaving, setVotingSaving] = useState(false);

	// --- 통합 뷰 상태 관리 ---
	const [currentView, setCurrentView] = useState('menu'); // 'menu' | 'generations' | 'password' | 'projects' | 'voting' | 'dashboard'

	const switchView = async (view) => {
		setCurrentView(view);
		if (view === 'generations') {
			setLocalGenerations(generations.map(g => ({ ...g })));
			setNewGenName('');
			setNewGenValue('');
		}
		if (view === 'voting') {
			const vs = await getVotingSettings();
			setAdminVotingSettings({
				isActive: vs.isActive || false,
				generation: vs.generation || (generations[generations.length - 1]?.value || 4),
				startDate: vs.startDate || ''
			});
		}
		if (view === 'projects') {
			setProjectEditTarget(null);
			setProjectEditData({});
			setProjectEditNewPw('');
		}
		if (view === 'password') {
			setCurrentPw('');
			setNewPw('');
			setConfirmPw('');
			setPwError('');
			setCurrentAdminPw('');
			setNewAdminPw('');
			setConfirmAdminPw('');
			setAdminPwError('');
		}
	};

	// Load Generations List
	useEffect(() => {
		getGenerations().then(list => {
			setGenerations(list);
			if (list.length > 0) {
				setSelectedGen(list[list.length - 1].value);
			}
		});
	}, []);

	// Fetch Students and Votes when authorized and generation changes
	useEffect(() => {
		if (isAuthorized) {
			loadDashboardData();
		}
	}, [isAuthorized, selectedGen]);

	const loadDashboardData = async () => {
		setDataLoading(true);
		setSelectedStudent(null);
		try {
			const [studentsList, matchupsList] = await Promise.all([
				getStudentsByGeneration(selectedGen),
				getMatchupsByGeneration(selectedGen)
			]);
			setStudents(studentsList);
			setMatchups(matchupsList);
		} catch (error) {
			console.error("Failed to load admin dashboard data:", error);
			showToast("데이터를 불러오는데 실패했습니다.", 'error');
		} finally {
			setDataLoading(false);
		}
	};

	// Auth Handlers

	const handlePasswordAuth = async (e) => {
		e.preventDefault();
		if (!systemPassword) {
			setAuthError("비밀번호를 입력해주세요.");
			return;
		}

		setAuthLoading(true);
		setAuthError('');
		try {
			const isValid = await verifyAdminPassword(systemPassword);
			if (isValid) {
				setIsAuthorized(true);
				sessionStorage.setItem('ktb_admin_auth', 'true');
				showToast("관리자 비밀번호 인증 성공!", 'success');
			} else {
				setAuthError("비밀번호가 일치하지 않습니다.");
			}
		} catch (error) {
			console.error("Admin password error:", error);
			setAuthError("인증 중 오류가 발생했습니다.");
		} finally {
			setAuthLoading(false);
		}
	};

	const handleLogout = () => {
		setIsAuthorized(false);
		sessionStorage.removeItem('ktb_admin_auth');
		setSystemPassword('');
		showToast("로그아웃 되었습니다.", 'success');
	};

	// Project Lookup Mapper
	const projectLookup = useMemo(() => {
		const lookup = {};
		projects.forEach(p => {
			lookup[p.id] = p;
		});
		return lookup;
	}, [projects]);

	// Calculate statistics
	const studentStats = useMemo(() => {
		let total = students.length;
		let completed = 0;
		let inProgress = 0;
		let noVote = 0;
		let totalVotesSum = 0;

		students.forEach(student => {
			const voteCount = student.voteCount || 0;
			totalVotesSum += voteCount;
			if (voteCount >= 40) {
				completed++;
			} else if (voteCount > 0) {
				inProgress++;
			} else {
				noVote++;
			}
		});

		return { total, completed, inProgress, noVote, totalVotes: totalVotesSum };
	}, [students]);

	// Filtered Students List
	const filteredStudents = useMemo(() => {
		return students.filter(student => {
			const voteCount = student.voteCount || 0;

			// Course filter
			if (filterCourse !== 'all' && student.course !== filterCourse) return false;

			// Status filter
			if (filterStatus === 'completed' && voteCount < 40) return false;
			if (filterStatus === 'in_progress' && (voteCount === 0 || voteCount >= 40)) return false;
			if (filterStatus === 'no_vote' && voteCount > 0) return false;

			// Search term filter
			if (searchTerm) {
				const term = searchTerm.toLowerCase();
				const matchName = student.name.toLowerCase().includes(term);
				const matchBirth = student.birthdate.includes(term);
				return matchName || matchBirth;
			}

			return true;
		}).map(student => ({
			...student,
			voteCount: student.voteCount || 0
		})).sort((a, b) => b.voteCount - a.voteCount || a.name.localeCompare(b.name));
	}, [students, filterCourse, filterStatus, searchTerm]);

	// Load student's votes on demand
	useEffect(() => {
		if (selectedStudent) {
			setLoadingStudentVotes(true);
			getVoterVotes(selectedStudent.id).then(list => {
				const sorted = list.filter(v => (v.generation || 3) === selectedGen)
					.sort((a, b) => {
						const tA = a.timestamp?.seconds || 0;
						const tB = b.timestamp?.seconds || 0;
						return tA - tB;
					});
				setSelectedStudentVotes(sorted);
				setLoadingStudentVotes(false);
			}).catch(err => {
				console.error("Failed to load voter votes:", err);
				setSelectedStudentVotes([]);
				setLoadingStudentVotes(false);
			});
		} else {
			setSelectedStudentVotes([]);
		}
	}, [selectedStudent, selectedGen]);

	// 1. Calculate project win rate stats dynamically from projects
	const projectStatsList = useMemo(() => {
		const genProjects = projects.filter(p => (p.generation || 3) === selectedGen);
		return genProjects.map(p => {
			const total = p.totalMatches || 0;
			const wins = p.wins || 0;
			const losses = p.losses || 0;
			const winRate = total > 0 ? (wins / total) * 100 : 0;
			return {
				...p,
				wins,
				losses,
				total,
				winRate: Math.round(winRate * 10) / 10
			};
		});
	}, [projects, selectedGen]);

	// 2. Filter and Sort Project Win Rates
	const filteredProjectStats = useMemo(() => {
		return projectStatsList.filter(p => {
			if (projectSearchTerm) {
				const term = projectSearchTerm.toLowerCase();
				return p.title.toLowerCase().includes(term) || (p.team && p.team.toLowerCase().includes(term));
			}
			return true;
		}).sort((a, b) => {
			if (projectSortBy === 'winRateDesc') return b.winRate - a.winRate || b.total - a.total;
			if (projectSortBy === 'winRateAsc') return a.winRate - b.winRate || a.total - b.total;
			if (projectSortBy === 'matchesDesc') return b.total - a.total || b.winRate - a.winRate;
			if (projectSortBy === 'title') return a.title.localeCompare(b.title);
			return 0;
		});
	}, [projectStatsList, projectSearchTerm, projectSortBy]);

	// 3. Head-to-Head Stats for Selected Project (using precomputed matchups)
	const projectH2HStats = useMemo(() => {
		if (!selectedProject) return [];

		const otherProjects = projects.filter(p => (p.generation || 3) === selectedGen && p.id !== selectedProject.id);
		const h2h = [];

		otherProjects.forEach(op => {
			const pairId = [selectedProject.id, op.id].sort().join("_");
			const match = matchups.find(m => [m.projectA, m.projectB].sort().join("_") === pairId);
			if (match && match.total > 0) {
				const isA = match.projectA === selectedProject.id;
				const wins = isA ? match.winsA : match.winsB;
				const losses = isA ? match.winsB : match.winsA;
				const winRate = match.total > 0 ? (wins / match.total) * 100 : 0;
				h2h.push({
					wins,
					losses,
					total: match.total,
					opponent: op,
					winRate: Math.round(winRate * 10) / 10
				});
			}
		});

		return h2h.sort((a, b) => b.winRate - a.winRate || b.total - a.total);
	}, [selectedProject, projects, matchups, selectedGen]);

	// Matchup Matrix calculation (using matchups)
	const matchupMatrix = useMemo(() => {
		const genProjects = projects.filter(p => (p.generation || 3) === selectedGen);
		const sortedList = [...projectStatsList].sort((a, b) => b.winRate - a.winRate || b.total - a.total);

		const matrix = {};
		sortedList.forEach(pA => {
			matrix[pA.id] = {};
			sortedList.forEach(pB => {
				if (pA.id === pB.id) {
					matrix[pA.id][pB.id] = { self: true };
				} else {
					matrix[pA.id][pB.id] = { wins: 0, losses: 0, total: 0, winRate: 0 };
				}
			});
		});

		matchups.forEach(match => {
			const { projectA, projectB, winsA, winsB, total } = match;
			if (matrix[projectA] && matrix[projectB]) {
				matrix[projectA][projectB] = { wins: winsA, losses: winsB, total, winRate: total > 0 ? Math.round((winsA / total) * 1000) / 10 : 0 };
				matrix[projectB][projectA] = { wins: winsB, losses: winsA, total, winRate: total > 0 ? Math.round((winsB / total) * 1000) / 10 : 0 };
			}
		});

		return { projects: sortedList, data: matrix };
	}, [projectStatsList, matchups, selectedGen]);

	// --- 프로젝트 설정 핸들러 ---

	const handleGenOrderChange = (index, direction) => {
		const arr = [...localGenerations];
		const targetIndex = index + direction;
		if (targetIndex < 0 || targetIndex >= arr.length) return;
		[arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]];
		// order 재할당
		const reordered = arr.map((g, i) => ({ ...g, order: i + 1 }));
		setLocalGenerations(reordered);
	};

	const handleAddGenerationClick = () => {
		if (!newGenName.trim()) {
			showToast('기수 이름을 입력해주세요.', 'error');
			return;
		}
		if (!newGenValue.toString().trim()) {
			showToast('기수값(숫자)을 입력해주세요.', 'error');
			return;
		}

		const valueNum = Number(newGenValue);
		if (isNaN(valueNum) || valueNum <= 0) {
			showToast('기수값은 올바른 양수 숫자여야 합니다.', 'error');
			return;
		}

		// 중복 체크
		const isNameDuplicate = localGenerations.some(g => g.name === newGenName.trim());
		const isValueDuplicate = localGenerations.some(g => g.value === valueNum);

		if (isNameDuplicate || isValueDuplicate) {
			showToast('이미 존재하는 기수 이름 또는 기수값입니다.', 'error');
			return;
		}

		const nextOrder = localGenerations.length > 0
			? Math.max(...localGenerations.map(g => g.order || 0)) + 1
			: 1;

		const newGenItem = {
			id: `gen_${valueNum}`,
			value: valueNum,
			name: newGenName.trim(),
			order: nextOrder
		};

		setLocalGenerations(prev => [...prev, newGenItem]);
		setNewGenName('');
		setNewGenValue('');
		showToast(`"${newGenItem.name}" 기수가 목록 하단에 추가되었습니다. 저장 버튼을 누르면 DB에 적용됩니다.`, 'info');
	};

	const handleSaveGenerations = async () => {
		setGenSaving(true);
		try {
			for (const gen of localGenerations) {
				await updateGeneration(gen.id, { id: gen.id, name: gen.name, order: gen.order, value: gen.value });
			}
			const updated = await getGenerations();
			setGenerations(updated);
			showToast('기수 정보가 저장되었습니다.', 'success');
		} catch (error) {
			console.error('Save generations error:', error);
			showToast('기수 정보 저장에 실패했습니다.', 'error');
		} finally {
			setGenSaving(false);
		}
	};

	const handleDeleteGeneration = async (gen) => {
		if (!window.confirm(`"${gen.name}" 기수를 정말로 삭제하시겠습니까?\n해당 기수에 등록된 모든 데이터(프로젝트, 학생 등)와의 연결에 영향을 줄 수 있습니다.`)) {
			return;
		}
		setGenSaving(true);
		try {
			const res = await deleteGeneration(gen.id);
			if (res.success) {
				const updated = await getGenerations();
				setGenerations(updated);
				setLocalGenerations(updated.map(g => ({ ...g })));
				showToast('기수가 삭제되었습니다.', 'success');
			} else {
				showToast('기수 삭제에 실패했습니다.', 'error');
			}
		} catch (error) {
			console.error('Delete generation error:', error);
			showToast('기수 삭제에 실패했습니다.', 'error');
		} finally {
			setGenSaving(false);
		}
	};

	const handleChangeSystemPassword = async (e) => {
		e.preventDefault();
		setPwError('');
		if (newPw.length < 4) {
			setPwError('새 비밀번호는 최소 4자 이상이어야 합니다.');
			return;
		}
		if (newPw !== confirmPw) {
			setPwError('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
			return;
		}
		setPwChanging(true);
		try {
			const result = await updateSystemPassword(currentPw, newPw);
			if (result.success) {
				showToast('입장 비밀번호가 변경되었습니다.', 'success');
				setCurrentPw('');
				setNewPw('');
				setConfirmPw('');
			} else {
				setPwError(result.error || '비밀번호 변경에 실패했습니다.');
			}
		} catch (error) {
			setPwError('오류가 발생했습니다. 다시 시도해주세요.');
		} finally {
			setPwChanging(false);
		}
	};

	const handleChangeAdminPassword = async (e) => {
		e.preventDefault();
		setAdminPwError('');
		if (newAdminPw.length < 4) {
			setAdminPwError('새 비밀번호는 최소 4자 이상이어야 합니다.');
			return;
		}
		if (newAdminPw !== confirmAdminPw) {
			setAdminPwError('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.');
			return;
		}
		setAdminPwChanging(true);
		try {
			const result = await updateAdminPassword(currentAdminPw, newAdminPw);
			if (result.success) {
				showToast('관리자 비밀번호가 변경되었습니다.', 'success');
				setCurrentAdminPw('');
				setNewAdminPw('');
				setConfirmAdminPw('');
			} else {
				setAdminPwError(result.error || '비밀번호 변경에 실패했습니다.');
			}
		} catch (error) {
			setAdminPwError('오류가 발생했습니다. 다시 시도해주세요.');
		} finally {
			setAdminPwChanging(false);
		}
	};

	const handleOpenProjectEdit = (project) => {
		setProjectEditTarget(project);
		setProjectEditData({
			title: project.title || '',
			team: project.team || '',
			description: project.description || '',
			url: project.url || '',
			tags: project.tags || [],
			generation: project.generation || selectedGen,
			members: project.members || []
		});
		setProjectEditNewPw('');
	};

	const handleSaveProjectEdit = async () => {
		if (!projectEditTarget) return;
		setProjectSaving(true);
		try {
			const result = await updateProject(projectEditTarget.id, projectEditData);
			if (!result.success) throw new Error('update failed');
			if (projectEditNewPw.trim()) {
				const pwResult = await adminUpdateProjectPassword(projectEditTarget.id, projectEditNewPw.trim());
				if (!pwResult.success) throw new Error('password update failed');
			}
			showToast('프로젝트가 수정되었습니다.', 'success');
			setProjectEditTarget(null);
			setProjectEditData({});
			setProjectEditNewPw('');
		} catch (error) {
			console.error('Project edit error:', error);
			showToast('프로젝트 수정에 실패했습니다.', 'error');
		} finally {
			setProjectSaving(false);
		}
	};

	const handleDeleteProject = async (project) => {
		if (!window.confirm(`"${project.title}" 프로젝트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
		try {
			const result = await adminDeleteProject(project.id);
			if (result.success) {
				showToast('프로젝트가 삭제되었습니다.', 'success');
				if (projectEditTarget?.id === project.id) {
					setProjectEditTarget(null);
				}
			} else {
				showToast('프로젝트 삭제에 실패했습니다.', 'error');
			}
		} catch (error) {
			console.error('Delete project error:', error);
			showToast('프로젝트 삭제 중 오류가 발생했습니다.', 'error');
		}
	};

	const handleSaveVotingSettings = async () => {
		setVotingSaving(true);
		try {
			const result = await saveVotingSettings(adminVotingSettings);
			if (result.success) {
				showToast('투표 설정이 저장되었습니다.', 'success');
			} else {
				showToast('투표 설정 저장에 실패했습니다.', 'error');
			}
		} catch (error) {
			console.error('Save voting settings error:', error);
			showToast('투표 설정 저장 중 오류가 발생했습니다.', 'error');
		} finally {
			setVotingSaving(false);
		}
	};

	const handleSyncData = async () => {
		if (window.confirm(`${selectedGen}기의 ELO 레이팅, 수강생 투표 수, 대전 기록 데이터를 기존 투표 원본 로그를 기반으로 전체 재집계하시겠습니까?\n이 작업은 데이터 양에 따라 수 초가 걸릴 수 있습니다.`)) {
			setSyncLoading(true);
			try {
				const res = await syncVotingData(selectedGen);
				if (res.success) {
					showToast(`성공적으로 데이터를 동기화했습니다! (총 ${res.voteCount}건 집계)`, 'success');
					loadDashboardData();
				} else {
					showToast("데이터 동기화에 실패했습니다.", 'error');
				}
			} catch (error) {
				console.error("Sync data error:", error);
				showToast("동기화 중 오류가 발생했습니다.", 'error');
			} finally {
				setSyncLoading(false);
			}
		}
	};

	const handleExportToExcel = async () => {
		setDataLoading(true);
		try {
			// Fetch votes list on demand for excel export
			const votesList = await getVotesByGeneration(selectedGen);
			const wb = XLSX.utils.book_new();

			// 1. Projects statistics
			const projectData = matchupMatrix.projects.map((p, idx) => ({
				"순위": idx + 1,
				"프로젝트명": p.title,
				"팀/조": p.team || "조 정보 없음",
				"총 매치": p.total,
				"승리": p.wins,
				"패배": p.losses,
				"승률 (%)": p.winRate
			}));
			const wsProjects = XLSX.utils.json_to_sheet(projectData);
			XLSX.utils.book_append_sheet(wb, wsProjects, "프로젝트별 승률 순위");

			// 2. Student progress
			const studentData = filteredStudents.map(student => ({
				"이름": student.name,
				"과정": student.course,
				"생년월일": student.birthdate,
				"투표수": student.voteCount,
				"상태": student.voteCount >= 40 ? "완료" : student.voteCount > 0 ? "진행 중" : "미참여"
			}));
			const wsStudents = XLSX.utils.json_to_sheet(studentData);
			XLSX.utils.book_append_sheet(wb, wsStudents, "수강생별 투표 현황");

			// 3. Raw matchup voting logs
			const rawLogs = votesList.map((vote, i) => {
				const projA = projectLookup[vote.projectA]?.title || "삭제된 프로젝트";
				const projB = projectLookup[vote.projectB]?.title || "삭제된 프로젝트";
				const winner = projectLookup[vote.winner]?.title || "삭제된 프로젝트";
				const student = students.find(s => s.id === vote.voterEmail);
				return {
					"순번": i + 1,
					"수강생 이름": student?.name || "알 수 없음",
					"과정": student?.course || "알 수 없음",
					"프로젝트 A": projA,
					"프로젝트 B": projB,
					"선택": winner,
					"투표 일시": vote.timestamp?.seconds ? new Date(vote.timestamp.seconds * 1000).toLocaleString('ko-KR') : "일시 정보 없음"
				};
			});
			const wsLogs = XLSX.utils.json_to_sheet(rawLogs);
			XLSX.utils.book_append_sheet(wb, wsLogs, "상세 투표 로그");

			// Write and trigger download
			XLSX.writeFile(wb, `해커톤_투표결과_${selectedGen}기.xlsx`);
			showToast("엑셀 파일이 다운로드되었습니다.", 'success');
		} catch (error) {
			console.error("Export to Excel failed:", error);
			showToast("엑셀 파일 내보내기에 실패했습니다.", 'error');
		} finally {
			setDataLoading(false);
		}
	};

	if (!isAuthorized) {
		return (
			<div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
				<div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700">
					<div className="text-center mb-6">
						<div className="w-14 h-14 bg-kakao-black dark:bg-white text-white dark:text-kakao-black rounded-full flex items-center justify-center mx-auto mb-4 shadow-md">
							<Shield className="w-6 h-6" />
						</div>
						<h3 className="text-xl font-bold text-gray-900 dark:text-white">관리자 대시보드 로그인</h3>
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
							시스템 마스터 비밀번호를 입력하여 관리자 권한을 인증합니다.
						</p>
					</div>

					<form onSubmit={handlePasswordAuth} className="space-y-4">
						<div>
							<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 ml-1">마스터 비밀번호</label>
							<input
								type="password"
								value={systemPassword}
								onChange={(e) => { setSystemPassword(e.target.value); setAuthError(''); }}
								placeholder="시스템 비밀번호 입력 (디폴트: 1234)"
								required
								autoFocus
								className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-650 focus:border-kakao-yellow focus:ring-kakao-yellow bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all text-sm"
							/>
						</div>

						{authError && (
							<p className="text-xs text-red-500 flex items-center gap-1.5 bg-red-50 dark:bg-red-900/10 p-2.5 rounded-lg">
								<AlertCircle className="w-4 h-4 flex-shrink-0" />
								<span>{authError}</span>
							</p>
						)}

						<div className="flex gap-2 pt-2">
							<button
								type="button"
								onClick={onBackToGallery}
								className="flex-1 py-3 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm text-center"
							>
								갤러리로 돌아가기
							</button>
							<button
								type="submit"
								disabled={authLoading}
								className="flex-1 py-3 bg-kakao-black dark:bg-white text-white dark:text-kakao-black hover:bg-gray-800 dark:hover:bg-gray-100 font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
							>
								{authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "로그인"}
							</button>
						</div>
					</form>
				</div>
			</div>
		);
	}

	// --- 뷰 헬퍼 렌더러 ---

	const renderHeader = () => (
		<div className="flex justify-between items-center pb-4 border-b border-gray-200 dark:border-gray-700 flex-wrap gap-4">
			<div className="flex items-center gap-3">
				<button
					onClick={onBackToGallery}
					className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl transition-colors"
					title="대시보드로 나가기"
				>
					<ArrowLeft className="w-5 h-5" />
				</button>
				<div>
					<h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
						<Shield className="w-5 h-5 text-amber-500" />
						<span>관리자 대시보드</span>
					</h2>
					<p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
						KTB 해커톤 시스템 통합 관리 센터
					</p>
				</div>
			</div>
			<button
				onClick={handleLogout}
				className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
			>
				로그아웃
			</button>
		</div>
	);

	const renderTabs = () => {
		const tabs = [
			{ key: 'menu', label: '어드민 홈' },
			{ key: 'generations', label: '기수 수정' },
			{ key: 'password', label: '입장 비밀번호' },
			{ key: 'projects', label: '프로젝트 관리' },
			{ key: 'voting', label: '투표 설정' },
			{ key: 'dashboard', label: '심층 투표 분석' },
		];

		return (
			<div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto pb-1 -mt-2 scrollbar-hide">
				{tabs.map(tab => (
					<button
						key={tab.key}
						onClick={() => switchView(tab.key)}
						className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-s font-bold border-b-2 transition-all ${currentView === tab.key
							? 'border-amber-400 text-amber-600 dark:text-amber-400'
							: 'border-transparent text-gray-555 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
							}`}
					>
						{tab.label}
					</button>
				))}
			</div>
		);
	};

	const renderMenuView = () => {
		const cards = [
			{
				key: 'generations',
				icon: Calendar,
				label: '갤러리 기수 수정',
				desc: 'AI 해커톤 갤러리에 노출되는 기수 목록을 변경하고 표시 순서를 조정합니다.',
				color: 'blue'
			},
			{
				key: 'password',
				icon: KeyRound,
				label: '입장 비밀번호 수정',
				desc: '대시보드 접속에 필요한 마스터 패스워드를 수정합니다.',
				color: 'amber'
			},
			{
				key: 'projects',
				icon: FileText,
				label: '프로젝트 관리',
				desc: '수강생 프로젝트 데이터를 어드민 권한으로 수정 및 제거합니다. (수강생 비번 불필요)',
				color: 'purple'
			},
			{
				key: 'voting',
				icon: Vote,
				label: '투표 진행 설정',
				desc: '실시간 해커톤 매치 투표의 기수 설정 및 활성화/예약 상태를 조정합니다.',
				color: 'green'
			},
			{
				key: 'dashboard',
				icon: Shield,
				label: '심층 투표 분석 대시보드',
				desc: '수강생 투표율, ELO 레이팅 랭킹 및 1대1 대전 매트릭스 로그를 상세 분석합니다.',
				color: 'indigo'
			}
		];

		return (
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 py-4">
				{cards.map(card => {
					const Icon = card.icon;
					const colors = {
						blue: 'border-blue-150 hover:border-blue-300 dark:border-blue-900/30 text-blue-500 hover:bg-blue-50/20 dark:hover:bg-blue-900/10',
						amber: 'border-amber-150 hover:border-amber-300 dark:border-amber-900/30 text-amber-500 hover:bg-amber-50/20 dark:hover:bg-amber-900/10',
						purple: 'border-purple-150 hover:border-purple-300 dark:border-purple-900/30 text-purple-500 hover:bg-purple-50/20 dark:hover:bg-purple-900/10',
						green: 'border-green-150 hover:border-green-300 dark:border-green-900/30 text-green-500 hover:bg-green-50/20 dark:hover:bg-green-900/10',
						indigo: 'border-indigo-150 hover:border-indigo-300 dark:border-indigo-900/30 text-indigo-500 hover:bg-indigo-50/20 dark:hover:bg-indigo-900/10'
					};
					return (
						<button
							key={card.key}
							onClick={() => switchView(card.key)}
							className={`flex flex-col text-left p-6 rounded-2xl border bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-all group ${colors[card.color]}`}
						>
							<div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl mb-4 group-hover:scale-105 transition-transform w-fit">
								<Icon className="w-6 h-6" />
							</div>
							<h3 className="text-sm font-black text-gray-900 dark:text-white mb-2">{card.label}</h3>
							<p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{card.desc}</p>
						</button>
					);
				})}
			</div>
		);
	};

	const renderGenerationsView = () => (
		<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4">
			<div>
				<h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
					<Calendar className="w-4 h-4 text-blue-500" />
					<span>갤러리 기수 수정</span>
				</h3>
				<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">기수 이름 및 표시 순서를 변경할 수 있습니다. 변경 후 반드시 저장 버튼을 눌러주세요.</p>
			</div>
			<div className="space-y-3 pt-2">
				{localGenerations.map((gen, index) => (
					<div key={gen.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-900 rounded-xl px-4 py-2.5">
						<span className="text-xs text-gray-400 dark:text-gray-500 w-5 text-center font-mono">{gen.order}</span>
						<input
							type="text"
							value={gen.name}
							onChange={(e) => setLocalGenerations(prev => prev.map(g => g.id === gen.id ? { ...g, name: e.target.value } : g))}
							className="flex-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
						/>
						<div className="flex flex-col gap-0.5">
							<button
								onClick={() => handleGenOrderChange(index, -1)}
								disabled={index === 0}
								className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
							>
								<ChevronUp className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={() => handleGenOrderChange(index, 1)}
								disabled={index === localGenerations.length - 1}
								className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
							>
								<ChevronDown className="w-3.5 h-3.5" />
							</button>
						</div>
						<button
							onClick={() => handleDeleteGeneration(gen)}
							disabled={genSaving}
							className="p-2 text-red-500 hover:text-red-750 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-xl transition-all disabled:opacity-30 flex-shrink-0"
							title="기수 삭제"
						>
							<Trash2 className="w-4 h-4" />
						</button>
					</div>
				))}

				{/* 기수 추가 폼 */}
				<div className="flex flex-wrap items-center gap-3 bg-blue-50/30 dark:bg-blue-955/10 rounded-xl px-4 py-3 border border-dashed border-blue-200 dark:border-blue-900/30">
					<div className="flex-1 min-w-[150px]">
						<label className="block text-[11px] font-bold text-gray-400 mb-1">기수 이름</label>
						<input
							type="text"
							placeholder="예: 5기 AI 해커톤"
							value={newGenName}
							onChange={(e) => setNewGenName(e.target.value)}
							className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
						/>
					</div>
					<div className="w-24">
						<label className="block text-[11px] font-bold text-gray-400 mb-1">기수 숫자</label>
						<input
							type="number"
							placeholder="예: 5"
							value={newGenValue}
							onChange={(e) => setNewGenValue(e.target.value)}
							className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
						/>
					</div>
					<div className="pt-5">
						<button
							type="button"
							onClick={handleAddGenerationClick}
							className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors h-[34px] flex-shrink-0"
						>
							<Plus className="w-3.5 h-3.5" />
							<span>기수 추가</span>
						</button>
					</div>
				</div>
			</div>
			<div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
				<button
					onClick={handleSaveGenerations}
					disabled={genSaving}
					className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
				>
					{genSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
					<span>{genSaving ? '저장 중...' : '저장'}</span>
				</button>
			</div>
		</div>
	);

	const renderPasswordView = () => (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
			{/* 입장 비밀번호 변경 카드 */}
			<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4">
				<div>
					<h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
						<KeyRound className="w-4 h-4 text-amber-500" />
						<span>갤러리 입장 비밀번호 수정</span>
					</h3>
					<p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">수강생들이 갤러리 및 투표 보드에 최초 진입할 때 쓰는 비밀번호를 변경합니다.</p>
				</div>
				<form onSubmit={handleChangeSystemPassword} className="space-y-4 pt-2">
					<div>
						<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">현재 입장 비밀번호</label>
						<input
							type="password"
							value={currentPw}
							onChange={(e) => { setCurrentPw(e.target.value); setPwError(''); }}
							placeholder="현재 입장 비밀번호 입력"
							required
							className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
						/>
					</div>
					<div>
						<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">새 입장 비밀번호</label>
						<input
							type="password"
							value={newPw}
							onChange={(e) => { setNewPw(e.target.value); setPwError(''); }}
							placeholder="새 비밀번호 입력 (최소 4자)"
							required
							className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
						/>
					</div>
					<div>
						<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">새 입장 비밀번호 확인</label>
						<input
							type="password"
							value={confirmPw}
							onChange={(e) => { setConfirmPw(e.target.value); setPwError(''); }}
							placeholder="새 비밀번호 다시 입력"
							required
							className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
						/>
					</div>
					{pwError && (
						<p className="text-xs text-red-500 flex items-center gap-1.5 bg-red-50 dark:bg-red-900/10 px-3 py-2 rounded-lg">
							<AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
							<span>{pwError}</span>
						</p>
					)}
					<div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
						<button
							type="submit"
							disabled={pwChanging}
							className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
						>
							{pwChanging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
							<span>{pwChanging ? '변경 중...' : '입장 비밀번호 변경'}</span>
						</button>
					</div>
				</form>
			</div>

			{/* 관리자 비밀번호 변경 카드 */}
			<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4">
				<div>
					<h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
						<Shield className="w-4 h-4 text-purple-500" />
						<span>관리자 마스터 비밀번호 수정</span>
					</h3>
					<p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">관리자 대시보드 로그인 시 사용하는 비밀번호를 변경합니다. (더 긴 강력한 패스워드 권장)</p>
				</div>
				<form onSubmit={handleChangeAdminPassword} className="space-y-4 pt-2">
					<div>
						<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">현재 관리자 비밀번호</label>
						<input
							type="password"
							value={currentAdminPw}
							onChange={(e) => { setCurrentAdminPw(e.target.value); setAdminPwError(''); }}
							placeholder="현재 관리자 비밀번호 입력"
							required
							className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
						/>
					</div>
					<div>
						<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">새 관리자 비밀번호</label>
						<input
							type="password"
							value={newAdminPw}
							onChange={(e) => { setNewAdminPw(e.target.value); setAdminPwError(''); }}
							placeholder="새 관리자 비밀번호 입력 (최소 4자)"
							required
							className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
						/>
					</div>
					<div>
						<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">새 관리자 비밀번호 확인</label>
						<input
							type="password"
							value={confirmAdminPw}
							onChange={(e) => { setConfirmAdminPw(e.target.value); setAdminPwError(''); }}
							placeholder="새 관리자 비밀번호 다시 입력"
							required
							className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
						/>
					</div>
					{adminPwError && (
						<p className="text-xs text-red-500 flex items-center gap-1.5 bg-red-50 dark:bg-red-900/10 px-3 py-2 rounded-lg">
							<AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
							<span>{adminPwError}</span>
						</p>
					)}
					<div className="flex justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
						<button
							type="submit"
							disabled={adminPwChanging}
							className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
						>
							{adminPwChanging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
							<span>{adminPwChanging ? '변경 중...' : '관리자 비밀번호 변경'}</span>
						</button>
					</div>
				</form>
			</div>
		</div>
	);

	const renderProjectsView = () => (
		<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4">
			<div className="flex justify-between items-center flex-wrap gap-3">
				<div>
					<h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
						<FileText className="w-4 h-4 text-purple-500" />
						<span>프로젝트 관리</span>
					</h3>
					<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
						현재 선택 기수({selectedGen}기) 프로젝트를 마스터 권한으로 수정 및 삭제 관리합니다.
					</p>
				</div>
				<div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl">
					<span className="text-xs text-gray-500 dark:text-gray-400 font-bold">기수 선택:</span>
					<select
						value={selectedGen}
						onChange={(e) => setSelectedGen(Number(e.target.value))}
						className="bg-transparent border-none text-xs font-black text-gray-900 dark:text-white outline-none cursor-pointer p-0"
					>
						{generations.map(gen => (
							<option key={gen.value} value={gen.value}>{gen.name}</option>
						))}
					</select>
				</div>
			</div>

			<div className="space-y-3 pt-2 max-h-[600px] overflow-y-auto pr-1">
				{projects
					.filter(p => (p.generation || 3) === selectedGen)
					.map(project => (
						<div key={project.id} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900">
							<div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-gray-50/50 dark:bg-gray-800/30">
								<div className="min-w-0">
									<p className="text-xs font-bold text-gray-900 dark:text-white truncate">{project.title}</p>
									<p className="text-xs text-gray-400 mt-0.5">{project.team || '팀 정보 없음'}</p>
								</div>
								<div className="flex items-center gap-1.5">
									<button
										onClick={() => projectEditTarget?.id === project.id ? setProjectEditTarget(null) : handleOpenProjectEdit(project)}
										className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold transition-colors"
									>
										<Edit2 className="w-3 h-3" />
										<span>수정</span>
									</button>
									<button
										onClick={() => handleDeleteProject(project)}
										className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 dark:text-red-400 rounded-lg text-xs font-bold transition-colors"
									>
										<Trash2 className="w-3 h-3" />
										<span>삭제</span>
									</button>
								</div>
							</div>

							{projectEditTarget?.id === project.id && (
								<div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<div>
											<label className="block text-xs font-bold text-gray-400 mb-1">프로젝트 명</label>
											<input
												type="text"
												value={projectEditData.title || ''}
												onChange={(e) => setProjectEditData(d => ({ ...d, title: e.target.value }))}
												className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
											/>
										</div>
										<div>
											<label className="block text-xs font-bold text-gray-400 mb-1">소속 팀 (조)</label>
											<input
												type="text"
												value={projectEditData.team || ''}
												onChange={(e) => setProjectEditData(d => ({ ...d, team: e.target.value }))}
												className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
											/>
										</div>
									</div>
									<div>
										<label className="block text-xs font-bold text-gray-400 mb-1">배포 / 데모 URL</label>
										<input
											type="url"
											value={projectEditData.url || ''}
											onChange={(e) => setProjectEditData(d => ({ ...d, url: e.target.value }))}
											className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
										/>
									</div>
									<div>
										<label className="block text-xs font-bold text-gray-400 mb-1">프로젝트 한 줄 설명</label>
										<textarea
											value={projectEditData.description || ''}
											onChange={(e) => setProjectEditData(d => ({ ...d, description: e.target.value }))}
											rows={3}
											className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 resize-none"
										/>
									</div>
									<div>
										<label className="block text-xs font-bold text-gray-400 mb-1">팀원 매핑 (수강생 목록)</label>
										<div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900 max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
											{students.map(student => {
												const isMember = (projectEditData.members || []).includes(student.id);
												return (
													<label key={student.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded transition-colors">
														<input
															type="checkbox"
															checked={isMember}
															onChange={(e) => {
																const currentMembers = projectEditData.members || [];
																let nextMembers;
																if (e.target.checked) {
																	nextMembers = [...currentMembers, student.id];
																} else {
																	nextMembers = currentMembers.filter(id => id !== student.id);
																}
																setProjectEditData(d => ({ ...d, members: nextMembers }));
															}}
															className="rounded border-gray-300 text-purple-650 focus:ring-purple-500"
														/>
														<span>{student.name} ({student.course})</span>
													</label>
												);
											})}
										</div>
										<p className="text-[10px] text-gray-400 mt-1">* 지정된 수강생은 ELO 투표 시 본인 프로젝트가 매치업 후보에서 제외됩니다.</p>
									</div>
									<div>
										<label className="block text-xs font-bold text-gray-400 mb-1">새 프로젝트 비밀번호 <span className="text-[11px] text-gray-400 font-normal">(변경할 때만 작성)</span></label>
										<input
											type="password"
											value={projectEditNewPw}
											onChange={(e) => setProjectEditNewPw(e.target.value)}
											placeholder="비밀번호 입력 시 기존 해시값을 오버라이드합니다."
											className="w-full px-3 py-2 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400"
										/>
									</div>
									<div className="flex justify-end gap-2 pt-1">
										<button
											onClick={() => { setProjectEditTarget(null); setProjectEditData({}); setProjectEditNewPw(''); }}
											className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
										>
											<X className="w-3 h-3" /><span>취소</span>
										</button>
										<button
											onClick={handleSaveProjectEdit}
											disabled={projectSaving}
											className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
										>
											{projectSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
											<span>{projectSaving ? '저장 중...' : '저장'}</span>
										</button>
									</div>
								</div>
							)}
						</div>
					))}
				{projects.filter(p => (p.generation || 3) === selectedGen).length === 0 && (
					<div className="text-center py-16 text-gray-400 text-xs">
						{selectedGen}기 프로젝트가 없습니다.
					</div>
				)}
			</div>
		</div>
	);

	const renderVotingView = () => (
		<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 space-y-4">
			<div>
				<h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
					<Vote className="w-4 h-4 text-green-500" />
					<span>투표 관리 및 세팅</span>
				</h3>
				<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">투표 활성화 상태 및 대상 기수, 매치 시작 예약 일정을 설정합니다.</p>
			</div>
			<div className="space-y-4 max-w-md pt-2">
				<div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-750">
					<div>
						<p className="text-xs font-bold text-gray-900 dark:text-white">투표 활성화</p>
						<p className="text-xs text-gray-400 mt-0.5">{adminVotingSettings.isActive ? '현재 투표가 활성화되어 실시간 진행 중입니다.' : '현재 투표가 비활성화되어 닫힌 상태입니다.'}</p>
					</div>
					<button
						onClick={() => setAdminVotingSettings(v => ({ ...v, isActive: !v.isActive }))}
						className={`transition-colors focus:outline-none ${adminVotingSettings.isActive
							? 'text-green-500 hover:text-green-650'
							: 'text-gray-300 dark:text-gray-600 hover:text-gray-400'
							}`}
					>
						{adminVotingSettings.isActive
							? <ToggleRight className="w-9 h-9" />
							: <ToggleLeft className="w-9 h-9" />
						}
					</button>
				</div>
				<div>
					<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">투표 대상 기수 지정</label>
					<div className="relative w-full">
						<select
							value={adminVotingSettings.generation}
							onChange={(e) => setAdminVotingSettings(v => ({ ...v, generation: Number(e.target.value) }))}
							className="w-full appearance-none px-3.5 py-2.5 pr-10 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 cursor-pointer font-semibold"
						>
							{generations.map(gen => (
								<option key={gen.value} value={gen.value}>{gen.name}</option>
							))}
						</select>
						<div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-gray-500 dark:text-gray-400">
							<ChevronDown className="w-4 h-4" />
						</div>
					</div>
				</div>
				<div>
					<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">투표 시작 예약 일정 <span className="text-gray-400 font-normal">(선택사항)</span></label>
					<input
						type="datetime-local"
						value={adminVotingSettings.startDate || ''}
						onChange={(e) => setAdminVotingSettings(v => ({ ...v, startDate: e.target.value }))}
						className="w-full px-3.5 py-2.5 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
					/>
				</div>
				<div className="flex justify-end pt-4 border-t border-gray-100 dark:border-gray-700">
					<button
						onClick={handleSaveVotingSettings}
						disabled={votingSaving}
						className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
					>
						{votingSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
						<span>{votingSaving ? '저장 중...' : '설정 저장'}</span>
					</button>
				</div>
			</div>
		</div>
	);

	const renderDashboardView = () => {
		const renderVotersSubTab = () => (
			<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
				<div className="lg:col-span-7 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
					<div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-3">
						<input
							type="text"
							placeholder="수강생 이름 또는 생년월일 검색..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="w-full md:w-2/3 px-4 py-2 text-xs border border-gray-255 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-kakao-yellow focus:ring-1 focus:ring-kakao-yellow"
						/>
						<div className="w-full md:w-1/3 flex gap-2">
							<select
								value={filterCourse}
								onChange={(e) => setFilterCourse(e.target.value)}
								className="flex-1 appearance-none pl-3 pr-8 py-2 text-xs border border-gray-250 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none cursor-pointer font-semibold bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:0.75rem_auto] bg-[right_0.65rem_center] bg-no-repeat"
							>
								<option value="all">모든 과정</option>
								<option value="풀스택">풀스택</option>
								<option value="인공지능">인공지능</option>
								<option value="클라우드">클라우드</option>
							</select>
							<select
								value={filterStatus}
								onChange={(e) => setFilterStatus(e.target.value)}
								className="flex-1 appearance-none pl-3 pr-8 py-2 text-xs border border-gray-250 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white outline-none cursor-pointer font-semibold bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:0.75rem_auto] bg-[right_0.65rem_center] bg-no-repeat"
							>
								<option value="all">모든 상태</option>
								<option value="completed">투표 완료</option>
								<option value="in_progress">진행 중</option>
								<option value="no_vote">미참여</option>
							</select>
						</div>
					</div>
					<div className="overflow-x-auto flex-1 max-h-[500px]">
						{dataLoading ? (
							<div className="text-center py-20 flex flex-col items-center justify-center gap-3">
								<RefreshCw className="w-8 h-8 animate-spin text-kakao-yellow" />
								<p className="text-xs text-gray-500">데이터 수집 중...</p>
							</div>
						) : filteredStudents.length === 0 ? (
							<div className="text-center py-20 text-gray-400">
								조건에 부합하는 수강생이 없습니다.
							</div>
						) : (
							<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
								<thead className="bg-gray-100 dark:bg-gray-800 sticky top-0 z-10">
									<tr>
										<th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800">이름</th>
										<th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800">과정</th>
										<th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800">생년월일</th>
										<th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800">투표수</th>
										<th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-800">상태</th>
										<th className="px-5 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20 bg-gray-100 dark:bg-gray-800">이력</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-gray-200 dark:divide-gray-750">
									{filteredStudents.map(student => (
										<tr
											key={student.id}
											className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer ${selectedStudent?.id === student.id ? 'bg-kakao-yellow/5 dark:bg-kakao-yellow/2.5' : ''}`}
											onClick={() => setSelectedStudent(student)}
										>
											<td className="px-5 py-3.5 whitespace-nowrap text-xs font-bold text-gray-900 dark:text-white">{student.name}</td>
											<td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400 font-semibold">{student.course}</td>
											<td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-400 font-mono">{student.birthdate}</td>
											<td className="px-5 py-3.5 whitespace-nowrap text-xs text-center font-bold text-gray-750 dark:text-gray-300">{student.voteCount} / 40</td>
											<td className="px-5 py-3.5 whitespace-nowrap text-center text-xs">
												{student.voteCount >= 40 ? (
													<span className="px-2 py-0.5 text-xs bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400 rounded-md font-bold border border-green-100 dark:border-green-900/30">완료</span>
												) : student.voteCount > 0 ? (
													<span className="px-2 py-0.5 text-xs bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-md font-bold border border-amber-100 dark:border-amber-900/30">진행 중</span>
												) : (
													<span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700/60 text-gray-400 rounded-md font-bold border border-gray-200 dark:border-gray-700">미참여</span>
												)}
											</td>
											<td className="px-5 py-3.5 whitespace-nowrap text-center text-xs">
												<ChevronRight className={`w-4 h-4 mx-auto text-gray-400 group-hover:translate-x-0.5 transition-transform ${selectedStudent?.id === student.id ? 'rotate-90' : ''}`} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>

				<div className="lg:col-span-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
					<div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800">
						<h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
							<FileText className="w-4 h-4 text-kakao-black dark:text-white" />
							<span>선택된 수강생 투표 상세 내역</span>
						</h3>
					</div>
					<div className="flex-1 overflow-y-auto max-h-[545px] p-4">
						{!selectedStudent ? (
							<div className="h-full flex flex-col items-center justify-center text-gray-400 py-20 text-center gap-2.5">
								<Eye className="w-10 h-10 text-gray-300 dark:text-gray-650" />
								<p className="text-xs">왼쪽 표에서 수강생을 선택하시면<br />매치별 투표 상세 로그를 볼 수 있습니다.</p>
							</div>
						) : loadingStudentVotes ? (
							<div className="text-center py-20 flex flex-col items-center justify-center gap-3">
								<RefreshCw className="w-8 h-8 animate-spin text-kakao-yellow" />
								<p className="text-xs text-gray-500">투표 이력 불러오는 중...</p>
							</div>
						) : (
							<div className="space-y-4">
								<div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-2xl border border-gray-100 dark:border-gray-750">
									<strong className="text-sm text-gray-800 dark:text-gray-200">{selectedStudent.name} ({selectedStudent.course})</strong>
									<span className="text-xs text-gray-400 block mt-1">생년월일: {selectedStudent.birthdate}</span>
									<span className="text-xs text-gray-400 block">누적 매치 횟수: {selectedStudent.voteCount}회</span>
								</div>

								{selectedStudentVotes.length === 0 ? (
									<p className="text-xs text-center text-gray-400 py-10">제출된 투표 이력이 없습니다.</p>
								) : (
									<div className="space-y-3.5">
										{selectedStudentVotes.map((vote, i) => {
											const projA = projectLookup[vote.projectA];
											const projB = projectLookup[vote.projectB];
											const isWinnerA = vote.winner === vote.projectA;
											const isWinnerB = vote.winner === vote.projectB;

											return (
												<div key={i} className="p-3.5 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-750 rounded-xl shadow-sm text-xs leading-normal">
													<div className="flex items-center justify-between gap-2 mb-1.5 text-[11px] text-gray-400">
														<span>매치 #{i + 1}</span>
														<span>
															{vote.timestamp?.seconds
																? new Date(vote.timestamp.seconds * 1000).toLocaleString('ko-KR', {
																	month: 'short',
																	day: 'numeric',
																	hour: '2-digit',
																	minute: '2-digit'
																})
																: '일시 정보 없음'
															}
														</span>
													</div>
													<div className="grid grid-cols-7 gap-2 items-center">
														<div className={`col-span-3 p-2 rounded-lg border flex flex-col justify-center min-h-[46px] transition-all ${isWinnerA
															? 'bg-green-50/60 dark:bg-green-950/20 border-green-300 dark:border-green-900/50 text-green-700 dark:text-green-400 font-bold'
															: 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-150 dark:border-gray-700 text-gray-500 dark:text-gray-450'
															}`}>
															<span className="line-clamp-2 leading-tight">{projA?.title || "삭제된 프로젝트"}</span>
														</div>
														<div className="col-span-1 text-center font-black text-gray-400 dark:text-gray-600 text-[11px] uppercase">VS</div>
														<div className={`col-span-3 p-2 rounded-lg border flex flex-col justify-center min-h-[46px] transition-all ${isWinnerB
															? 'bg-green-50/60 dark:bg-green-950/20 border-green-300 dark:border-green-900/50 text-green-700 dark:text-green-400 font-bold'
															: 'bg-gray-50/50 dark:bg-gray-800/40 border-gray-150 dark:border-gray-700 text-gray-500 dark:text-gray-450'
															}`}>
															<span className="line-clamp-2 leading-tight">{projB?.title || "삭제된 프로젝트"}</span>
														</div>
													</div>
													<div className="mt-2 flex items-center gap-1.5 text-[11px] text-green-600 dark:text-green-400 font-semibold bg-green-50/30 dark:bg-green-950/10 px-2 py-1 rounded-lg w-max border border-green-100/50 dark:border-green-900/20">
														<Check className="w-3.5 h-3.5" />
														<span>선택: {isWinnerA ? (projA?.title || "프로젝트 A") : (projB?.title || "프로젝트 B")}</span>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
		);

		const renderProjectsSubTab = () => (
			<div className="flex flex-col gap-6">
				<div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-250 dark:border-gray-700 shadow-sm flex-wrap gap-3">
					<div>
						<h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
							<Trophy className="w-4 h-4 text-amber-500" />
							<span>프로젝트별 ELO 상대 전적</span>
						</h3>
						<p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
							{projectViewMode === 'list' 
								? "프로젝트 ELO 순위 리스트와 개별 프로젝트 클릭 시 상대 전적(H2H)을 상세히 분석합니다." 
								: "모든 프로젝트 간 1:1 대전 승률을 한눈에 볼 수 있는 매트릭스 크로스 히트맵입니다."}
						</p>
					</div>
					<div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl border border-gray-200 dark:border-gray-700 w-fit">
						<button
							onClick={() => setProjectViewMode('list')}
							className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${projectViewMode === 'list'
								? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
								: 'text-gray-500 dark:text-gray-400 hover:text-gray-900'
								}`}
						>
							리스트 뷰
						</button>
						<button
							onClick={() => setProjectViewMode('matrix')}
							className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${projectViewMode === 'matrix'
								? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
								: 'text-gray-550 dark:text-gray-400 hover:text-gray-900'
								}`}
						>
							매트릭스 뷰
						</button>
					</div>
				</div>

				{projectViewMode === 'list' ? (
					<div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
						<div className="lg:col-span-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
							<div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800">
								<h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
									<span>🏆 ELO 랭킹 리스트</span>
								</h3>
							</div>
							<div className="overflow-y-auto max-h-[500px] flex-1">
								<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
									<thead className="bg-gray-55 dark:bg-gray-800/50">
										<tr>
											<th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">순위</th>
											<th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">프로젝트명</th>
											<th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">ELO</th>
											<th className="px-4 py-3 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">전적 (승률)</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-gray-200 dark:divide-gray-750">
										{matchupMatrix.projects.map((p, idx) => (
											<tr 
												key={p.id}
												onClick={() => setSelectedProject(p)}
												className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${selectedProject?.id === p.id ? 'bg-kakao-yellow/5 dark:bg-kakao-yellow/2.5' : ''}`}
											>
												<td className="px-4 py-3.5 text-center text-xs font-bold text-gray-900 dark:text-white">{idx + 1}</td>
												<td className="px-4 py-3.5 text-xs font-bold text-gray-900 dark:text-white">{p.title}</td>
												<td className="px-4 py-3.5 text-center text-xs font-mono font-bold text-amber-600 dark:text-amber-400">{p.elo}</td>
												<td className="px-4 py-3.5 text-center text-xs text-gray-550 dark:text-gray-400">{p.wins}W - {p.losses}L ({p.winRate}%)</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>

						<div className="lg:col-span-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
							<div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800">
								<h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
									<span>📊 1:1 Head-to-Head 전적</span>
								</h3>
							</div>
							<div className="p-4 flex-1 overflow-y-auto max-h-[500px]">
								{!selectedProject ? (
									<div className="h-full flex flex-col items-center justify-center text-gray-400 py-20 text-center gap-2">
										<Eye className="w-10 h-10 text-gray-300 dark:text-gray-650" />
										<p className="text-xs">왼쪽 리스트에서 프로젝트를 선택하시면<br />상대 프로젝트별 개별 매치 전적을 볼 수 있습니다.</p>
									</div>
								) : (
									<div className="space-y-4">
										<div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-750">
											<strong className="text-sm text-gray-900 dark:text-white">{selectedProject.title}</strong>
											<span className="text-xs text-gray-400 block mt-1">누적 전적: {selectedProject.wins}승 {selectedProject.losses}패 (승률 {selectedProject.winRate}%)</span>
											<span className="text-xs text-amber-500 font-bold block">현재 ELO: {selectedProject.elo}</span>
										</div>

										<div className="space-y-2">
											{matchupMatrix.projects
												.filter(op => op.id !== selectedProject.id)
												.map(op => {
													const h2h = matchupMatrix.data[selectedProject.id]?.[op.id] || { wins: 0, losses: 0, total: 0, winRate: 0 };
													return (
														<div key={op.id} className="p-3 bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-750 rounded-xl flex items-center justify-between text-xs">
															<span className="font-bold text-gray-700 dark:text-gray-300 max-w-[180px] truncate">{op.title}</span>
															<div className="text-right">
																<span className="font-mono font-bold text-gray-900 dark:text-white">{h2h.wins}W - {h2h.losses}L</span>
																<span className="text-gray-400 ml-2">({h2h.winRate}%)</span>
															</div>
														</div>
													);
												})}
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				) : (
					<div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
						<div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-55/50 dark:bg-gray-800">
							<h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
								<span>🧮 H2H 상대 승률 매트릭스 (%)</span>
							</h3>
						</div>
						<div className="overflow-x-auto p-4">
							{matchupMatrix.projects.length === 0 ? (
								<div className="py-20 text-center text-gray-450 text-xs">등록된 프로젝트가 없습니다.</div>
							) : (
								<table className="border-collapse mx-auto min-w-full">
									<thead>
										<tr>
											<th className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-left text-xs font-bold text-gray-500 dark:text-gray-400 min-w-[120px] max-w-[120px] truncate">프로젝트</th>
											{matchupMatrix.projects.map(p => (
												<th 
													key={p.id} 
													className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-1 py-2 text-center text-[11px] font-bold text-gray-500 dark:text-gray-400 min-w-[55px] max-w-[55px] truncate"
													title={p.title}
												>
													{p.title.slice(0, 4)}..
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{matchupMatrix.projects.map(pRow => {
											return (
												<tr key={pRow.id}>
													<td className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs font-bold text-gray-900 dark:text-white truncate max-w-[120px]" title={pRow.title}>
														{pRow.title}
													</td>
													{matchupMatrix.projects.map(pCol => {
														const cell = matchupMatrix.data[pRow.id]?.[pCol.id];
														if (!cell || cell.self) {
															return (
																<td 
																	key={pCol.id}
																	className="border border-gray-200 dark:border-gray-700 text-center text-gray-300 dark:text-gray-600 px-1 py-2 font-mono text-xs bg-gray-50 dark:bg-gray-800/40"
																>
																	-
																</td>
															);
														}
														const wr = cell.winRate;
														let colorClass = "bg-gray-50 dark:bg-gray-800/40 text-gray-550 dark:text-gray-450";
														if (wr > 70) {
															colorClass = "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300";
														} else if (wr > 50) {
															colorClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-955/20 dark:text-emerald-400";
														} else if (wr < 30) {
															colorClass = "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-300";
														} else if (wr < 50) {
															colorClass = "bg-rose-50 text-rose-700 dark:bg-rose-955/20 dark:text-rose-455";
														}
														return (
															<td 
																key={pCol.id}
																className={`border border-gray-200 dark:border-gray-700 text-center px-1 py-1 font-bold ${colorClass}`}
																title={`${pRow.title} vs ${pCol.title}\n승률: ${wr}%\n전적: ${cell.wins}승 ${cell.losses}패 (총 ${cell.total}회)`}
															>
																<span className="text-xs block">{wr}%</span>
																<span className="text-[11px] opacity-75 font-normal block mt-0.5">{cell.wins}W-{cell.losses}L</span>
															</td>
														);
													})}
												</tr>
											);
										})}
									</tbody>
								</table>
							)}
						</div>
						<div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 text-xs text-gray-500">
							<span className="font-semibold text-gray-700 dark:text-gray-300">범례:</span>
							<div className="flex items-center gap-1.5">
								<span className="w-3 h-3 bg-emerald-100 dark:bg-emerald-900/40 rounded border border-emerald-200 dark:border-emerald-800"></span>
								<span>승률 우세 (&gt; 50%)</span>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="w-3 h-3 bg-rose-100 dark:bg-rose-900/40 rounded border border-rose-200 dark:border-rose-800"></span>
								<span>승률 열세 (&lt; 50%)</span>
							</div>
							<div className="flex items-center gap-1.5">
								<span className="w-3 h-3 bg-gray-100 dark:bg-gray-750 rounded border border-gray-200 dark:border-gray-700"></span>
								<span>매치 없음 / 자기 자신</span>
							</div>
						</div>
					</div>
				)}
			</div>
		);

		return (
			<div className="flex flex-col gap-6">
				{/* 툴바 (기수선택, 동기화, 다운로드) */}
				<div className="flex items-center gap-3 flex-wrap bg-gray-50 dark:bg-gray-800/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
					<div className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl">
						<span className="text-xs text-gray-500 dark:text-gray-400 font-bold">조회 기수:</span>
						<select
							value={selectedGen}
							onChange={(e) => setSelectedGen(Number(e.target.value))}
							className="bg-transparent border-none text-xs font-black text-gray-900 dark:text-white outline-none cursor-pointer p-0"
						>
							{generations.map(gen => (
								<option key={gen.value} value={gen.value}>{gen.name}</option>
							))}
						</select>
					</div>

					<button
						onClick={loadDashboardData}
						className="p-2 bg-white hover:bg-gray-105 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-700 transition-colors"
						title="데이터 새로고침"
					>
						<RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin' : ''}`} />
					</button>

					<button
						onClick={handleSyncData}
						disabled={syncLoading || dataLoading}
						className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
						title="기존 투표 로그 기반으로 ELO, 투표수, 대진 매트릭스 데이터 재집계"
					>
						<RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
						<span>데이터 동기화</span>
					</button>

					<button
						onClick={handleExportToExcel}
						disabled={syncLoading || dataLoading}
						className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
						title="엑셀 파일 다운로드"
					>
						<Download className="w-3.5 h-3.5" />
						<span>결과 다운로드</span>
					</button>
				</div>

				{/* 5대 지표 카드로 구성된 Stats Grid */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
					<div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
						<div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-500 rounded-xl"><Users className="w-6 h-6" /></div>
						<div>
							<span className="text-xs text-gray-400 dark:text-gray-500 block font-medium">등록 수강생</span>
							<strong className="text-2xl font-black text-gray-900 dark:text-white block mt-0.5">{studentStats.total}명</strong>
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
						<div className="p-3 bg-green-50 dark:bg-green-900/20 text-green-500 rounded-xl"><CheckCircle2 className="w-6 h-6" /></div>
						<div>
							<span className="text-xs text-gray-400 dark:text-gray-500 block font-medium">투표 완료 (40회)</span>
							<strong className="text-2xl font-black text-gray-900 dark:text-white block mt-0.5">{studentStats.completed}명</strong>
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
						<div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-xl"><Clock className="w-6 h-6" /></div>
						<div>
							<span className="text-xs text-gray-400 dark:text-gray-500 block font-medium">투표 진행 중</span>
							<strong className="text-2xl font-black text-gray-900 dark:text-white block mt-0.5">{studentStats.inProgress}명</strong>
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
						<div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl"><Lock className="w-6 h-6" /></div>
						<div>
							<span className="text-xs text-gray-400 dark:text-gray-500 block font-medium">미참여 수강생</span>
							<strong className="text-2xl font-black text-gray-900 dark:text-white block mt-0.5">{studentStats.noVote}명</strong>
						</div>
					</div>

					<div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center gap-4">
						<div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-500 rounded-xl"><Trophy className="w-6 h-6" /></div>
						<div>
							<span className="text-xs text-gray-400 dark:text-gray-500 block font-medium">총 누적 투표수</span>
							<strong className="text-2xl font-black text-gray-900 dark:text-white block mt-0.5">{studentStats.totalVotes}회</strong>
						</div>
					</div>
				</div>

				{/* 서브탭 전환 스위처 */}
				<div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-xl border border-gray-200 dark:border-gray-700 w-fit">
					<button
						onClick={() => { setActiveSubTab('voters'); setSelectedStudent(null); }}
						className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeSubTab === 'voters'
							? 'bg-kakao-yellow text-kakao-black shadow-sm'
							: 'text-gray-555 dark:text-gray-400 hover:text-gray-900'
							}`}
					>
						<Users className="w-3.5 h-3.5" />
						<span>수강생별 투표 현황</span>
					</button>
					<button
						onClick={() => { setActiveSubTab('projects'); setSelectedProject(null); }}
						className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${activeSubTab === 'projects'
							? 'bg-kakao-yellow text-kakao-black shadow-sm'
							: 'text-gray-555 dark:text-gray-400 hover:text-gray-900'
							}`}
					>
						<Trophy className="w-3.5 h-3.5" />
						<span>프로젝트별 ELO 통계</span>
					</button>
				</div>

				{/* 서브탭 내용 */}
				{activeSubTab === 'voters' ? renderVotersSubTab() : renderProjectsSubTab()}
			</div>
		);
	};

	return (
		<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 flex flex-col gap-6 font-sans">
			{renderHeader()}
			{renderTabs()}

			{currentView === 'menu' && renderMenuView()}
			{currentView === 'generations' && renderGenerationsView()}
			{currentView === 'password' && renderPasswordView()}
			{currentView === 'projects' && renderProjectsView()}
			{currentView === 'voting' && renderVotingView()}
			{currentView === 'dashboard' && renderDashboardView()}
		</div>
	);
};

export default AdminDashboard;
