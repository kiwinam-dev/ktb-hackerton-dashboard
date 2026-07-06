import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { 
	Trophy, Vote, Lock, Mail, ArrowRight, LogOut, 
	RefreshCw, Settings, CheckCircle2, AlertCircle, 
	Crown, Medal, Shield, Eye, Play, Square, Info, Calendar
} from 'lucide-react';
import { 
	getVotingSettings, 
	saveVotingSettings, 
	verifyStudentVoter, 
	submitVote, 
	getVoterVotes, 
	db
} from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const K_FACTOR = 32;
const INITIAL_ELO = 1200;
const MAX_VOTES_PER_USER = 40;

const preprocessMarkdown = (text) => {
	if (!text) return '';
	
	// Replace HTML <br> tags with newlines
	let processed = text.replace(/<br\s*\/?>/gi, '\n');

	// 1. Convert HTML img tags (e.g. <img src="..."> or <img src="..." />) to markdown image syntax ![image](url)
	processed = processed.replace(
		/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/g,
		'![image]($1)'
	);

	// 2. Convert GitHub blob URLs to raw user content URLs
	processed = processed.replace(
		/https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/([^\s\)\"\<\>]+)/g,
		'https://raw.githubusercontent.com/$1/$2/$3/$4'
	);

	return processed;
};

const VotingView = ({ projects, onProjectClick, showToast, generations = [] }) => {
	// Active main tab: 'vote' or 'ranking' or 'admin'
	const [activeTab, setActiveTab] = useState('vote');
	
	// Settings State
	const [settings, setSettings] = useState({ isActive: false, generation: 4 });
	const [settingsLoading, setSettingsLoading] = useState(true);

	// Voter Auth State
	const [voter, setVoter] = useState(() => {
		const saved = localStorage.getItem('ktb_voter');
		return saved ? JSON.parse(saved) : null;
	});
	
	const [selectedCourse, setSelectedCourse] = useState('풀스택');
	const [voterName, setVoterName] = useState('');
	const [birthdate, setBirthdate] = useState('');
	const [authLoading, setAuthLoading] = useState(false);
	const [authError, setAuthError] = useState('');
	const [showAdminLogin, setShowAdminLogin] = useState(false);

	// Voting State
	const [voterVotes, setVoterVotes] = useState([]);
	const [votingLoading, setVotingLoading] = useState(false);
	const [currentPair, setCurrentPair] = useState(null);
	const [skippedPairs, setSkippedPairs] = useState(new Set());

	// Ranking State
	const [rankingGen, setRankingGen] = useState(4);

	// Admin Edit State
	const [adminIsActive, setAdminIsActive] = useState(false);
	const [adminGen, setAdminGen] = useState(4);
	const [adminStartDate, setAdminStartDate] = useState('');
	const [adminSaving, setAdminSaving] = useState(false);

	// 1. Subscribe to Voting Settings in real-time
	useEffect(() => {
		const docRef = doc(db, "settings", "voting");
		const unsubscribe = onSnapshot(docRef, (docSnap) => {
			if (docSnap.exists()) {
				const data = docSnap.data();
				setSettings(data);
				setAdminIsActive(data.isActive);
				setAdminGen(data.generation);
				setRankingGen(data.generation);
				setAdminStartDate(data.startDate || '');
			} else {
				saveVotingSettings({ isActive: true, generation: 4, startDate: "" });
			}
			setSettingsLoading(false);
		}, (err) => {
			console.error("Settings subscription error:", err);
			setSettingsLoading(false);
		});

		return () => unsubscribe();
	}, []);

	// 2. Fetch Voter Votes when logged in & settings loaded
	useEffect(() => {
		if (voter && settings.generation) {
			loadVoterVotes();
		}
	}, [voter, settings.generation]);



	const loadVoterVotes = async () => {
		if (!voter) return;
		setVotingLoading(true);
		try {
			const votes = await getVoterVotes(voter.email);
			const filtered = votes.filter(v => v.generation === settings.generation);
			setVoterVotes(filtered);
		} catch (error) {
			console.error("Failed to load voter votes:", error);
		} finally {
			setVotingLoading(false);
		}
	};


	// --- Voter Auth Handlers ---
	const handleStudentAuthSubmit = async (e) => {
		e.preventDefault();
		const name = voterName.trim();
		const birth = birthdate.trim();

		if (!name) {
			setAuthError("이름을 입력해주세요.");
			return;
		}
		if (!birth || birth.length !== 6 || !/^\d{6}$/.test(birth)) {
			setAuthError("생년월일 6자리를 숫자로 입력해주세요 (예: 930125).");
			return;
		}

		setAuthLoading(true);
		setAuthError('');
		try {
			const res = await verifyStudentVoter(settings.generation, selectedCourse, name, birth);
			if (res.success) {
				const voterData = res.voter;
				setVoter(voterData);
				localStorage.setItem('ktb_voter', JSON.stringify(voterData));
				showToast(`${voterData.name}님, 인증되었습니다.`, 'success');
				setVoterName('');
				setBirthdate('');
			} else {
				setAuthError(res.error);
			}
		} catch (error) {
			console.error("Student auth error:", error);
			setAuthError("인증 중 오류가 발생했습니다. 다시 시도해주세요.");
		} finally {
			setAuthLoading(false);
		}
	};

	const handleLogout = () => {
		setVoter(null);
		localStorage.removeItem('ktb_voter');
		setVoterVotes([]);
		setCurrentPair(null);
		setSkippedPairs(new Set());
		showToast("로그아웃되었습니다.", 'success');
	};

	// --- ELO Ranking Board Calculation ---
	const eloRankings = useMemo(() => {
		const genProjects = projects.filter(p => (p.generation || 3) === rankingGen);
		return genProjects.map(p => ({
			...p,
			elo: p.elo || 1200,
			wins: p.wins || 0,
			losses: p.losses || 0,
			totalMatches: p.totalMatches || 0
		})).sort((a, b) => b.elo - a.elo);
	}, [projects, rankingGen]);

	// --- Matchup Pairing Logic ---
	const activeGenProjects = useMemo(() => {
		return projects.filter(p => (p.generation || 3) === settings.generation);
	}, [projects, settings.generation]);

	const allPairs = useMemo(() => {
		const pairs = [];
		const len = activeGenProjects.length;
		for (let i = 0; i < len; i++) {
			for (let j = i + 1; j < len; j++) {
				pairs.push([activeGenProjects[i], activeGenProjects[j]]);
			}
		}
		return pairs;
	}, [activeGenProjects]);

	const targetMatches = useMemo(() => {
		return Math.min(MAX_VOTES_PER_USER, allPairs.length);
	}, [allPairs]);

	const votedPairKeysSet = useMemo(() => {
		const keys = new Set();
		voterVotes.forEach(vote => {
			const sortedIds = [vote.projectA, vote.projectB].sort();
			keys.add(sortedIds.join('_'));
		});
		return keys;
	}, [voterVotes]);

	const unvotedPairs = useMemo(() => {
		return allPairs.filter(pair => {
			const key = [pair[0].id, pair[1].id].sort().join('_');
			return !votedPairKeysSet.has(key) && !skippedPairs.has(key);
		});
	}, [allPairs, votedPairKeysSet, skippedPairs]);

	useEffect(() => {
		if (voter && settings.isActive && !votingLoading && votedPairKeysSet.size < targetMatches && unvotedPairs.length > 0 && !currentPair) {
			selectRandomPair();
		}
	}, [voter, settings.isActive, unvotedPairs, currentPair, votingLoading, votedPairKeysSet.size, targetMatches]);

	const selectRandomPair = () => {
		if (unvotedPairs.length === 0) {
			setCurrentPair(null);
			return;
		}

		// 1. Count appearances of each project in the user's submitted votes
		const appearances = {};
		activeGenProjects.forEach(p => {
			appearances[p.id] = 0;
		});
		voterVotes.forEach(vote => {
			if (appearances[vote.projectA] !== undefined) appearances[vote.projectA]++;
			if (appearances[vote.projectB] !== undefined) appearances[vote.projectB]++;
		});

		// 2. Score each unvoted pair (sum of appearances of both projects)
		const scoredPairs = unvotedPairs.map(pair => {
			const score = (appearances[pair[0].id] || 0) + (appearances[pair[1].id] || 0);
			return { pair, score };
		});

		// 3. Find the minimum score among all unvoted pairs
		const minScore = Math.min(...scoredPairs.map(sp => sp.score));

		// 4. Filter pairs that have the minimum score
		const bestScoredPairs = scoredPairs.filter(sp => sp.score === minScore);

		// 5. Select one randomly from the best scored pairs
		const randomIndex = Math.floor(Math.random() * bestScoredPairs.length);
		setCurrentPair(bestScoredPairs[randomIndex].pair);
	};

	const handleVote = async (winnerId) => {
		if (!voter || !currentPair) return;
		const [projA, projB] = currentPair;
		
		const newVote = {
			projectA: projA.id,
			projectB: projB.id,
			winner: winnerId,
			voterEmail: voter.email,
			generation: settings.generation
		};
		setVoterVotes(prev => [...prev, newVote]);
		setCurrentPair(null);

		try {
			await submitVote(
				voter.email,
				projA.id,
				projB.id,
				winnerId,
				settings.generation
			);
		} catch (error) {
			console.error("Error submitting vote:", error);
			showToast("투표 저장에 실패했습니다. 다시 시도해주세요.", 'error');
			setVoterVotes(prev => prev.filter(v => !(v.projectA === projA.id && v.projectB === projB.id)));
		}
	};

	const handleSkipPair = () => {
		if (!currentPair) return;
		const key = [currentPair[0].id, currentPair[1].id].sort().join('_');
		setSkippedPairs(prev => {
			const next = new Set(prev);
			next.add(key);
			return next;
		});
		setCurrentPair(null);
	};

	const handleResetSkipped = () => {
		setSkippedPairs(new Set());
		setCurrentPair(null);
	};

	const handleSaveAdminSettings = async (e) => {
		e.preventDefault();
		setAdminSaving(true);
		try {
			const res = await saveVotingSettings({
				isActive: adminIsActive,
				generation: Number(adminGen),
				startDate: adminStartDate.trim()
			});
			if (res.success) {
				showToast("투표 설정이 성공적으로 저장되었습니다.", 'success');
			} else {
				showToast("설정 저장에 실패했습니다.", 'error');
			}
		} catch (error) {
			console.error("Admin save error:", error);
			showToast("설정 저장 중 오류가 발생했습니다.", 'error');
		} finally {
			setAdminSaving(false);
		}
	};

	const progressPercent = targetMatches > 0 
		? Math.min(100, Math.round((votedPairKeysSet.size / targetMatches) * 100)) 
		: 0;

	return (
		<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex-1 w-full flex flex-col gap-6 font-sans">
			{/* Tab Switcher */}
			<div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-4 flex-wrap gap-4">
				<div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
					<button
						onClick={() => setActiveTab('vote')}
						className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'vote'
							? 'bg-kakao-yellow text-kakao-black shadow-sm'
							: 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-250'
							}`}
					>
						<Vote className="w-4 h-4" />
						<span>투표하기</span>
					</button>
					<button
						onClick={() => setActiveTab('ranking')}
						className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'ranking'
							? 'bg-kakao-yellow text-kakao-black shadow-sm'
							: 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-250'
							}`}
					>
						<Trophy className="w-4 h-4" />
						<span>투표 랭킹</span>
					</button>
					{voter?.isAdmin && (
						<button
							onClick={() => setActiveTab('admin')}
							className={`px-5 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'admin'
								? 'bg-red-500 text-white shadow-sm'
								: 'text-red-400 hover:text-red-600 dark:hover:text-red-300'
								}`}
						>
							<Shield className="w-4 h-4" />
							<span>관리자 도구</span>
						</button>
					)}
				</div>

				{voter && (
					<div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
						<span className="text-xs text-gray-500 dark:text-gray-400 font-medium truncate max-w-[150px] sm:max-w-none">
							투표참여: <strong className="text-gray-800 dark:text-gray-200">{voter.generation || settings.generation}기 {voter.course} {voter.name}</strong>
						</span>
						<button
							onClick={handleLogout}
							className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-bold flex items-center gap-1 transition-colors"
						>
							<LogOut className="w-3.5 h-3.5" />
							<span>로그아웃</span>
						</button>
					</div>
				)}
			</div>

			{/* Main Content Area */}
			<div className="flex-1 flex flex-col justify-center min-h-[450px]">
				{settingsLoading ? (
					<div className="text-center py-20 flex flex-col items-center justify-center gap-3">
						<RefreshCw className="w-8 h-8 animate-spin text-kakao-yellow" />
						<p className="text-gray-500 dark:text-gray-400">투표 환경 설정 불러오는 중...</p>
					</div>
				) : (
					<AnimatePresence mode="wait">
						{activeTab === 'vote' && (
							<motion.div
								key="vote-tab"
								initial={{ opacity: 0, y: 15 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -15 }}
								transition={{ duration: 0.25 }}
								className="flex flex-col flex-1"
							>
								{!settings.isActive && !voter?.isAdmin && !showAdminLogin ? (
									/* 2. Voting Inactive Screen */
									<div className="max-w-md w-full mx-auto text-center py-12 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl my-auto">
										<div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
											<Calendar className="w-8 h-8" />
										</div>
										<h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">투표 시작 전입니다</h3>
										<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
											아직 공식 ELO 투표가 시작되지 않았습니다.<br />
											{settings.startDate ? (
												<span className="inline-block mt-2.5 font-bold text-kakao-black dark:text-kakao-yellow bg-kakao-yellow/10 px-3.5 py-2 rounded-xl border border-kakao-yellow/20">
													투표 시작 예정: {settings.startDate}
												</span>
											) : (
												"투표 오픈 일정이 확정되는 대로 공개됩니다."
											)}
										</p>
										<div className="flex flex-col gap-2">
											<button
												onClick={() => setActiveTab('ranking')}
												className="w-full py-2.5 bg-kakao-yellow hover:bg-yellow-400 text-kakao-black font-bold rounded-xl shadow-sm transition-colors text-sm"
											>
												이전 투표 결과 (랭킹) 보기
											</button>
											<button
												onClick={() => setShowAdminLogin(true)}
												className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-2 underline"
											>
												관리자 로그인
											</button>
										</div>
									</div>
								) : !voter ? (
									/* 1. Voter Auth Block */
									<div className="max-w-md w-full mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700 my-auto">
										<div className="text-center mb-6">
											<div className="w-14 h-14 bg-kakao-yellow/20 text-kakao-black dark:text-kakao-yellow rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
												<Lock className="w-6 h-6" />
											</div>
											<h3 className="text-xl font-bold text-gray-900 dark:text-white">학생 본인 인증 ({settings.generation}기)</h3>
											<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
												공정한 ELO 투표 집계를 위해 수강생 인증을 진행합니다.
											</p>
										</div>

										<form onSubmit={handleStudentAuthSubmit} className="space-y-4">
											{/* Course Selection */}
											<div>
												<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 ml-1">과정 선택</label>
												<select
													value={selectedCourse}
													onChange={(e) => setSelectedCourse(e.target.value)}
													className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-kakao-yellow focus:ring-kakao-yellow bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all text-sm font-bold cursor-pointer"
												>
													<option value="풀스택">풀스택 과정</option>
													<option value="인공지능">인공지능 과정</option>
													<option value="클라우드">클라우드 과정</option>
												</select>
											</div>

											{/* Name Input */}
											<div>
												<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 ml-1">이름</label>
												<input
													type="text"
													value={voterName}
													onChange={(e) => {
														setVoterName(e.target.value);
														setAuthError('');
													}}
													placeholder="홍길동"
													required
													className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-kakao-yellow focus:ring-kakao-yellow bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all text-sm"
												/>
											</div>

											{/* Birthdate Input */}
											<div>
												<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 ml-1">생년월일 6자리</label>
												<input
													type="text"
													value={birthdate}
													onChange={(e) => {
														const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
														setBirthdate(val);
														setAuthError('');
													}}
													placeholder="930125"
													maxLength={6}
													required
													className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-kakao-yellow focus:ring-kakao-yellow bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all text-sm font-mono tracking-widest text-center"
												/>
												<span className="text-[10px] text-gray-400 mt-1 block">
													* YYMMDD 형식으로 6자리 숫자를 입력해 주세요.
												</span>
											</div>

											{authError && (
												<p className="text-xs text-red-500 flex items-center gap-1 bg-red-50 dark:bg-red-900/10 p-2.5 rounded-lg leading-relaxed">
													<AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
													<span>{authError}</span>
												</p>
											)}

											<button
												type="submit"
												disabled={authLoading}
												className="w-full py-3 bg-kakao-yellow hover:bg-yellow-400 text-kakao-black font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
											>
												{authLoading ? (
													<RefreshCw className="w-4 h-4 animate-spin" />
												) : (
													<>
														<span>인증 및 투표 시작</span>
														<ArrowRight className="w-4 h-4" />
													</>
												)}
											</button>

											{!settings.isActive && (
												<button
													type="button"
													onClick={() => {
														setShowAdminLogin(false);
														setAuthError('');
													}}
													className="w-full py-2 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-bold rounded-xl text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
												>
													돌아가기
												</button>
											)}
										</form>
									</div>
								) : activeGenProjects.length < 2 ? (
									/* 3. Empty Project Screen */
									<div className="max-w-md w-full mx-auto text-center py-12 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl my-auto">
										<div className="text-5xl mb-4">🦁</div>
										<h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{settings.generation}기 프로젝트 없음</h3>
										<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
											현재 투표 대상인 {settings.generation}기에 등록된 프로젝트가 부족하여 투표를 진행할 수 없습니다. (최소 2개 이상 필요)
										</p>
									</div>
								) : (votedPairKeysSet.size >= targetMatches || unvotedPairs.length === 0) && !currentPair ? (
									/* 4. Complete State */
									<div className="max-w-md w-full mx-auto text-center py-12 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl my-auto">
										<div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
											<CheckCircle2 className="w-8 h-8" />
										</div>
										<h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">투표 완료! 🎉</h3>
										<p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">
											{settings.generation}기 프로젝트의 ELO 매치업 투표 목표를 달성하셨습니다.<br />
											소중한 한 표 감사합니다!
										</p>
										
										{skippedPairs.size > 0 && votedPairKeysSet.size < targetMatches && (
											<button
												onClick={handleResetSkipped}
												className="w-full py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-xs mb-3"
											>
												건너뛴 항목 ({skippedPairs.size}개) 다시 투표하기
											</button>
										)}

										<button
											onClick={() => setActiveTab('ranking')}
											className="w-full py-3 bg-kakao-yellow hover:bg-yellow-400 text-kakao-black font-bold rounded-xl shadow-sm transition-colors text-sm"
										>
											실시간 랭킹 보드 보기
										</button>
									</div>
								) : (
									/* 5. Voting Pair Matchup */
									<div className="flex flex-col gap-6 w-full max-w-4xl mx-auto py-2">
										{/* Progress Bar */}
										<div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
											<div className="flex justify-between items-center mb-2">
												<span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
													<Info className="w-3.5 h-3.5 text-kakao-yellow" />
													<span>{settings.generation}기 매치업 ELO 투표 진행률</span>
												</span>
												<span className="text-xs font-bold text-kakao-black dark:text-kakao-yellow">
													{votedPairKeysSet.size} / {targetMatches} 매치 ({progressPercent}%)
												</span>
											</div>
											<div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
												<motion.div 
													className="bg-kakao-yellow h-full rounded-full"
													initial={{ width: 0 }}
													animate={{ width: `${progressPercent}%` }}
													transition={{ duration: 0.4 }}
												/>
											</div>
										</div>

										{/* Matchup Board */}
										<div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative items-stretch">
											<AnimatePresence mode="wait">
												{currentPair && (
													<>
														{/* Project A Card */}
														<motion.div
															key={`card-A-${currentPair[0].id}`}
															initial={{ opacity: 0, x: -30 }}
															animate={{ opacity: 1, x: 0 }}
															exit={{ opacity: 0, x: -30 }}
															transition={{ duration: 0.3 }}
															onClick={() => handleVote(currentPair[0].id)}
															className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:shadow-2xl hover:border-kakao-yellow dark:hover:border-kakao-yellow transition-all duration-300 flex flex-col group relative transform hover:-translate-y-1"
														>
															<div className="h-44 bg-gray-100 dark:bg-gray-700 relative overflow-hidden flex-shrink-0">
																{currentPair[0].imageUrl ? (
																	<img 
																		src={currentPair[0].imageUrl} 
																		alt={currentPair[0].title} 
																		className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
																		onError={(e) => { e.target.src = "https://via.placeholder.com/640x360?text=No+Image"; }}
																	/>
																) : (
																	<div className="w-full h-full flex items-center justify-center text-gray-400">이미지 준비중</div>
																)}
																<div className="absolute top-3 left-3 bg-black/75 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10">
																	{currentPair[0].team || "조 정보 없음"}
																</div>
															</div>
															<div className="p-5 flex-1 flex flex-col justify-between">
																<div>
																	<h4 className="text-2xl font-black text-gray-900 dark:text-white line-clamp-1 mb-1.5 group-hover:text-kakao-black dark:group-hover:text-kakao-yellow transition-colors">
																		{currentPair[0].title}
																	</h4>
																	{currentPair[0].tags && currentPair[0].tags.length > 0 && (
																		<div className="flex flex-wrap gap-1 mb-2">
																			{currentPair[0].tags.slice(0, 3).map((tag, i) => (
																				<span key={i} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-bold border border-blue-100 dark:border-blue-900/30">
																					#{tag}
																				</span>
																			))}
																		</div>
																	)}
																	<div className="text-gray-500 dark:text-gray-400 text-xs line-clamp-3 leading-relaxed mb-4 prose prose-sm dark:prose-invert prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-li:my-0 max-w-none break-all">
																		<ReactMarkdown 
																			remarkPlugins={[remarkGfm, remarkBreaks]}
																			components={{
																				h1: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h2: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h3: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h4: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h5: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h6: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																			}}
																		>
																			{preprocessMarkdown(currentPair[0].description)}
																		</ReactMarkdown>
																	</div>
																</div>
																<button 
																	onClick={(e) => { e.stopPropagation(); onProjectClick(currentPair[0]); }}
																	className="w-full py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs transition-colors border border-gray-205 dark:border-gray-700"
																>
																	상세 설명 & 스펙 보기
																</button>
															</div>
															{/* Vote Hover Overlay */}
															<div className="absolute inset-0 bg-kakao-yellow/5 dark:bg-kakao-yellow/2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl border-2 border-transparent group-hover:border-kakao-yellow" />
														</motion.div>

														{/* VS Badge in absolute center (desktop only) */}
														<div className="hidden md:flex absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 w-11 h-11 bg-kakao-black dark:bg-white text-white dark:text-kakao-black border-4 border-gray-50 dark:border-gray-900 rounded-full items-center justify-center font-black text-xs shadow-lg tracking-widest pointer-events-none">
															VS
														</div>

														{/* Project B Card */}
														<motion.div
															key={`card-B-${currentPair[1].id}`}
															initial={{ opacity: 0, x: 30 }}
															animate={{ opacity: 1, x: 0 }}
															exit={{ opacity: 0, x: 30 }}
															transition={{ duration: 0.3 }}
															onClick={() => handleVote(currentPair[1].id)}
															className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer hover:shadow-2xl hover:border-kakao-yellow dark:hover:border-kakao-yellow transition-all duration-300 flex flex-col group relative transform hover:-translate-y-1"
														>
															<div className="h-44 bg-gray-100 dark:bg-gray-700 relative overflow-hidden flex-shrink-0">
																{currentPair[1].imageUrl ? (
																	<img 
																		src={currentPair[1].imageUrl} 
																		alt={currentPair[1].title} 
																		className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
																		onError={(e) => { e.target.src = "https://via.placeholder.com/640x360?text=No+Image"; }}
																	/>
																) : (
																	<div className="w-full h-full flex items-center justify-center text-gray-400">이미지 준비중</div>
																)}
																<div className="absolute top-3 left-3 bg-black/75 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded border border-white/10">
																	{currentPair[1].team || "조 정보 없음"}
																</div>
															</div>
															<div className="p-5 flex-1 flex flex-col justify-between">
																<div>
																	<h4 className="text-2xl font-black text-gray-900 dark:text-white line-clamp-1 mb-1.5 group-hover:text-kakao-black dark:group-hover:text-kakao-yellow transition-colors">
																		{currentPair[1].title}
																	</h4>
																	{currentPair[1].tags && currentPair[1].tags.length > 0 && (
																		<div className="flex flex-wrap gap-1 mb-2">
																			{currentPair[1].tags.slice(0, 3).map((tag, i) => (
																				<span key={i} className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-bold border border-blue-100 dark:border-blue-900/30">
																					#{tag}
																				</span>
																			))}
																		</div>
																	)}
																	<div className="text-gray-500 dark:text-gray-400 text-xs line-clamp-3 leading-relaxed mb-4 prose prose-sm dark:prose-invert prose-p:my-0 prose-headings:my-0 prose-ul:my-0 prose-li:my-0 max-w-none break-all">
																		<ReactMarkdown 
																			remarkPlugins={[remarkGfm, remarkBreaks]}
																			components={{
																				h1: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h2: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h3: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h4: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h5: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																				h6: ({node, ...props}) => <span className="font-bold text-xs" {...props} />,
																			}}
																		>
																			{preprocessMarkdown(currentPair[1].description)}
																		</ReactMarkdown>
																	</div>
																</div>
																<button 
																	onClick={(e) => { e.stopPropagation(); onProjectClick(currentPair[1]); }}
																	className="w-full py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-xs transition-colors border border-gray-200 dark:border-gray-700"
																>
																	상세 설명 & 스펙 보기
																</button>
															</div>
															{/* Vote Hover Overlay */}
															<div className="absolute inset-0 bg-kakao-yellow/5 dark:bg-kakao-yellow/2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl border-2 border-transparent group-hover:border-kakao-yellow" />
														</motion.div>
													</>
												)}
											</AnimatePresence>
										</div>

										{/* Skip Action */}
										<div className="flex justify-center gap-4 mt-2">
											<button
												onClick={handleSkipPair}
												className="px-5 py-2.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
											>
												이 매치 건너뛰기
											</button>
										</div>
									</div>
								)}
							</motion.div>
						)}

						{activeTab === 'ranking' && (
							/* ELO Ranking Board View */
							<motion.div
								key="ranking-tab"
								initial={{ opacity: 0, y: 15 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -15 }}
								transition={{ duration: 0.25 }}
								className="flex flex-col gap-6 flex-1 w-full"
							>
								{/* Generation Selector for Ranking Board */}
								<div className="flex justify-between items-center flex-wrap gap-4 bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
									<h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
										<Trophy className="w-5 h-5 text-amber-500" />
										<span>ELO 실시간 랭킹 보드</span>
									</h3>
									
									<div className="flex items-center gap-2">
										<span className="text-xs font-semibold text-gray-500 dark:text-gray-400">기수 선택:</span>
										<select
											value={rankingGen}
											onChange={(e) => setRankingGen(Number(e.target.value))}
											className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none cursor-pointer"
										>
											{generations.map(gen => (
												<option key={gen.value} value={gen.value}>{gen.name}</option>
											))}
										</select>
									</div>
								</div>

								{/* Ranking Board Grid/List */}
								{eloRankings.length === 0 ? (
									<div className="text-center py-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
										<div className="text-5xl mb-4">🦁</div>
										<h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">등록된 데이터가 없습니다</h4>
										<p className="text-xs text-gray-500 dark:text-gray-400">
											{generations.find(g => g.value === rankingGen)?.name || `${rankingGen}기`}에 등록된 프로젝트가 없거나 진행된 투표 로그가 없습니다.
										</p>
									</div>
								) : (
									<div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden flex-1 flex flex-col">
										<div className="overflow-x-auto">
											<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
												<thead className="bg-gray-50 dark:bg-gray-700/50">
													<tr>
														<th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-550 dark:text-gray-300 uppercase tracking-wider w-20">순위</th>
														<th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-550 dark:text-gray-300 uppercase tracking-wider">프로젝트 정보</th>
														<th scope="col" className="px-6 py-4 text-left text-xs font-bold text-gray-550 dark:text-gray-300 uppercase tracking-wider w-32">팀</th>
														<th scope="col" className="px-6 py-4 text-center text-xs font-bold text-gray-550 dark:text-gray-300 uppercase tracking-wider w-36">매치 전적 (승/패)</th>
														<th scope="col" className="px-6 py-4 text-right text-xs font-bold text-gray-550 dark:text-gray-300 uppercase tracking-wider w-36">ELO Rating</th>
													</tr>
												</thead>
												<tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
													{eloRankings.map((proj, index) => {
														const rank = index + 1;
														const isTop3 = rank <= 3;
														
														return (
															<tr 
																key={proj.id}
																onClick={() => onProjectClick(proj)}
																className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors cursor-pointer"
															>
																{/* Rank Badge */}
																<td className="px-6 py-4 whitespace-nowrap align-middle">
																	<div className="flex items-center justify-start">
																		{rank === 1 ? (
																			<span className="w-7 h-7 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center font-bold text-sm shadow-sm" title="1등 (우승)">
																				<Crown className="w-4 h-4 fill-current text-amber-500" />
																			</span>
																		) : rank === 2 ? (
																			<span className="w-7 h-7 bg-gray-200 text-gray-700 rounded-full flex items-center justify-center font-bold text-sm shadow-sm" title="2등">
																				<Medal className="w-4 h-4 text-gray-500" />
																			</span>
																		) : rank === 3 ? (
																			<span className="w-7 h-7 bg-amber-50 text-amber-800 rounded-full flex items-center justify-center font-bold text-sm shadow-sm" title="3등">
																				<Medal className="w-4 h-4 text-amber-700" />
																			</span>
																		) : (
																			<span className="w-7 h-7 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full flex items-center justify-center text-xs font-bold">
																				{rank}
																			</span>
																		)}
																	</div>
																</td>

																{/* Project Info */}
																<td className="px-6 py-4 align-middle">
																	<div className="flex items-center gap-3">
																		{(proj.thumbnailUrl || proj.imageUrl) && (
																			<img 
																				src={proj.thumbnailUrl || proj.imageUrl} 
																				alt={proj.title} 
																				loading="lazy"
																				className="w-12 h-8 object-cover rounded-md border border-gray-100 dark:border-gray-700 flex-shrink-0"
																				onError={(e) => {
																					if (e.target.src !== proj.imageUrl && proj.imageUrl) {
																						e.target.src = proj.imageUrl;
																					} else {
																						e.target.style.display = 'none';
																					}
																				}}
																			/>
																		)}
																		<div className="min-w-0">
																			<div className="text-sm font-bold text-gray-900 dark:text-white truncate">
																				{proj.title}
																			</div>
																			<div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-md">
																				{proj.description}
																			</div>
																		</div>
																	</div>
																</td>

																{/* Team */}
																<td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-300 align-middle">
																	{proj.team || "-"}
																</td>

																{/* Win / Loss Stats */}
																<td className="px-6 py-4 whitespace-nowrap text-center text-xs font-bold text-gray-500 dark:text-gray-400 align-middle">
																	<span className="text-blue-600 dark:text-blue-400">{proj.wins}승</span>
																	<span className="mx-1">/</span>
																	<span className="text-red-500 dark:text-red-400">{proj.losses}패</span>
																	<span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1.5 block sm:inline">({proj.totalMatches}회 매칭)</span>
																</td>

																{/* ELO Score */}
																<td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold align-middle">
																	<span className={`px-2.5 py-1 rounded-md text-xs ${isTop3
																		? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
																		: 'text-gray-900 dark:text-white'
																		}`}>
																		{proj.elo} 점
																	</span>
																</td>
															</tr>
														);
													})}
												</tbody>
											</table>
										</div>
										<div className="bg-gray-50/50 dark:bg-gray-700/30 px-6 py-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
											* 총 투표 매치 기록 수: <strong className="text-gray-800 dark:text-gray-200">{eloRankings.reduce((sum, p) => sum + (p.totalMatches || 0), 0)}건</strong> (매주 투표를 통해 무작위 경쟁에 의한 점수 누적 방식)
										</div>
									</div>
								)}
							</motion.div>
						)}

						{activeTab === 'admin' && voter?.isAdmin && (
							/* Admin Settings Controls */
							<motion.div
								key="admin-tab"
								initial={{ opacity: 0, y: 15 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -15 }}
								transition={{ duration: 0.25 }}
								className="max-w-md w-full mx-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-8 my-auto"
							>
								<div className="flex items-center gap-2 mb-6 pb-2 border-b border-gray-100 dark:border-gray-700">
									<Settings className="w-5 h-5 text-red-500 animate-spin" style={{ animationDuration: '6s' }} />
									<h3 className="text-lg font-bold text-gray-900 dark:text-white">투표 설정 (관리자 전용)</h3>
								</div>

								<form onSubmit={handleSaveAdminSettings} className="space-y-6">
									{/* Active Toggle */}
									<div>
										<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 ml-1">투표 활성화 상태</label>
										<div className="flex gap-2">
											<button
												type="button"
												onClick={() => setAdminIsActive(true)}
												className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border text-sm ${adminIsActive
													? 'bg-green-500 text-white border-transparent shadow-sm'
													: 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
													}`}
											>
												<Play className="w-4 h-4" />
												<span>투표 진행 (Active)</span>
											</button>
											<button
												type="button"
												onClick={() => setAdminIsActive(false)}
												className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all border text-sm ${!adminIsActive
													? 'bg-red-500 text-white border-transparent shadow-sm'
													: 'bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
													}`}
											>
												<Square className="w-4 h-4" />
												<span>투표 종료 (Inactive)</span>
											</button>
										</div>
									</div>

									{/* Generation Cohort Input */}
									<div>
										<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 ml-1">투표 진행 기수</label>
										<select
											value={adminGen}
											onChange={(e) => setAdminGen(Number(e.target.value))}
											className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-kakao-yellow focus:ring-kakao-yellow bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all text-sm font-bold cursor-pointer"
										>
											{generations.map(gen => (
												<option key={gen.value} value={gen.value}>{gen.name} 프로젝트 투표</option>
											))}
										</select>
										<span className="text-[10px] text-gray-450 mt-1 block">
											* 설정한 기수의 프로젝트들이 무작위로 매칭되며 랭킹보드 기준이 됩니다.
										</span>
									</div>

									{/* Vote Start Date Input */}
									<div>
										<label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 ml-1">투표 시작 시간 및 안내</label>
										<input
											type="text"
											value={adminStartDate}
											onChange={(e) => setAdminStartDate(e.target.value)}
											placeholder="예: 2026년 7월 10일 오후 6시"
											className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-kakao-yellow focus:ring-kakao-yellow bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 transition-all text-sm"
										/>
										<span className="text-[10px] text-gray-450 mt-1 block">
											* 투표가 종료(Inactive)되었을 때 수강생들에게 보여줄 시작 일시를 입력합니다.
										</span>
									</div>

									{/* Save Button */}
									<button
										type="submit"
										disabled={adminSaving}
										className="w-full py-3 bg-kakao-black dark:bg-white text-white dark:text-kakao-black hover:bg-gray-800 dark:hover:bg-gray-200 font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
									>
										{adminSaving ? (
											<RefreshCw className="w-4 h-4 animate-spin" />
										) : (
											"설정사항 업데이트"
										)}
									</button>
								</form>
							</motion.div>
						)}
					</AnimatePresence>
				)}
			</div>
		</div>
	);
};

export default VotingView;
