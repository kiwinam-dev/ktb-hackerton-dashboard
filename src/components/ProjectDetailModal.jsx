import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { X, Send, Trash2, Calendar, User, Edit2, Check, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { addComment, subscribeToComments, deleteComment, updateComment, verifyCommentPassword, subscribeToDeployments, addDeploymentLog, deleteDeploymentLog, verifyProjectPassword, getDeploymentCount, updateDeploymentLog } from '../lib/firebase';
import PasswordModal from './PasswordModal';
import ConfirmModal from './ConfirmModal';
import { checkProfanity } from '../lib/profanityFilter';

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

const ProjectDetailModal = ({ project, isOpen, onClose, onCommentSuccess, showToast }) => {
	const [comments, setComments] = useState([]);
	const [newComment, setNewComment] = useState('');
	const [authorName, setAuthorName] = useState('');
	const [password, setPassword] = useState('');
	const [deleteTargetId, setDeleteTargetId] = useState(null);
	const [editTargetId, setEditTargetId] = useState(null); // ID of comment being edited (password verified)
	const [editingId, setEditingId] = useState(null); // ID of comment currently being edited (inline)
	const [editContent, setEditContent] = useState('');
	const [editPassword, setEditPassword] = useState('');

	const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
	const [passwordModalMode, setPasswordModalMode] = useState('delete'); // 'delete' or 'edit'

	const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
	const [pendingDeletePassword, setPendingDeletePassword] = useState(null);

	const [isSubmitting, setIsSubmitting] = useState(false);

	// Deployment Logs State
	const [deployments, setDeployments] = useState([]);
	const [isAddingDeployment, setIsAddingDeployment] = useState(false);
	const [newVersion, setNewVersion] = useState('');
	const [newLogContent, setNewLogContent] = useState('');
	const [deploymentPassword, setDeploymentPassword] = useState('');
	const [deployLimit, setDeployLimit] = useState(1); // Start with 1 log
	const [totalDeployments, setTotalDeployments] = useState(0);
	const [editingDeploymentId, setEditingDeploymentId] = useState(null);
	const [editVersion, setEditVersion] = useState('');
	const [editLogContent, setEditLogContent] = useState('');
	const SHOW_MORE_COUNT = 5;

	// Version Regex: strict Major.Minor.Patch (e.g. 1.0.0, 2.12.3)
	const VERSION_REGEX = /^\d+\.\d+\.\d+$/;

	useEffect(() => {
		if (isOpen && project) {
			document.body.style.overflow = 'hidden';
			const unsubscribe = subscribeToComments(project.id, (data) => {
				setComments(data);
			});
			return () => {
				unsubscribe();
				document.body.style.overflow = 'unset';
			};
		}
	}, [isOpen, project]);

	// Handle ESC key to close modal
	useEffect(() => {
		if (isOpen) {
			const handleEsc = (e) => {
				if (e.key === 'Escape') {
					// Do not close if sub-modals are open
					if (!isPasswordModalOpen && !isConfirmModalOpen) {
						onClose();
					}
				}
			};
			window.addEventListener('keydown', handleEsc);
			return () => window.removeEventListener('keydown', handleEsc);
		}
	}, [isOpen, onClose, isPasswordModalOpen, isConfirmModalOpen]);

	// Subscribe to deployments
	useEffect(() => {
		if (isOpen && project) {
			// Fetch total count initially and whenever deployments change (to keep sync)
			getDeploymentCount(project.id).then(setTotalDeployments);

			const unsubscribe = subscribeToDeployments(project.id, (data) => {
				setDeployments(data);
				// Also update count on real-time update if possible, or just re-fetch
				getDeploymentCount(project.id).then(setTotalDeployments);
			}, deployLimit);
			return () => unsubscribe();
		}
	}, [isOpen, project, deployLimit]);

	const handleCommentSubmit = async (e) => {
		e.preventDefault();
		if (!newComment.trim() || !authorName.trim() || !password.trim()) return;

		// Profanity Check
		// Profanity Check
		if (checkProfanity(newComment)) {
			alert("비속어가 포함된 댓글은 등록할 수 없습니다. 바르고 고운 말을 써주세요! 😊");
			return;
		}

		setIsSubmitting(true);
		const result = await addComment(project.id, {
			content: newComment,
			author: authorName,
			password: password
		});
		setIsSubmitting(false);

		if (result.success) {
			setNewComment('');
			// Optional: Keep author name/password for convenience or clear them? 
			// Let's keep author name, clear password for security habit, though for hackathon convenience maybe keep?
			// Clearing password is safer.
			setPassword('');
			if (onCommentSuccess) onCommentSuccess("댓글이 등록되었습니다!");
		} else {
			alert("댓글 등록에 실패했습니다.");
		}
	};

	const handleDeleteClick = (commentId) => {
		setDeleteTargetId(commentId);
		setPasswordModalMode('delete');
		setIsPasswordModalOpen(true);
	};

	const handleEditClick = (commentId) => {
		setEditTargetId(commentId);
		setPasswordModalMode('edit');
		setIsPasswordModalOpen(true);
	};

	const handlePasswordVerify = async (inputPassword) => {
		const sessionId = localStorage.getItem('hackathon_session_id');
		if (passwordModalMode === 'delete') {
			const result = await verifyCommentPassword(project.id, deleteTargetId, inputPassword, sessionId);
			if (result.success) {
				if (window.confirm("정말로 댓글을 삭제하시겠습니까?")) {
					await deleteComment(project.id, deleteTargetId, inputPassword);
					setIsPasswordModalOpen(false);
					setDeleteTargetId(null);
					if (showToast) showToast("댓글이 삭제되었습니다!", 'success');
					return true;
				} else {
					// User cancelled delete after password verify - just close modal?
					setIsPasswordModalOpen(false);
					return true; // Technically password was valid
				}
			} else {
				return result; // Return object with error message
			}
		} else if (passwordModalMode === 'edit') {
			const result = await verifyCommentPassword(project.id, editTargetId, inputPassword, sessionId);
			if (result.success) {
				setIsPasswordModalOpen(false);
				setEditPassword(inputPassword);

				const commentToEdit = comments.find(c => c.id === editTargetId);
				if (commentToEdit) {
					setEditContent(commentToEdit.content);
					setEditingId(editTargetId);
				}
				setEditTargetId(null);
				return true;
			} else {
				return result; // Return object with error message
			}
		} else if (passwordModalMode === 'add_deployment' || passwordModalMode === 'delete_deployment' || passwordModalMode === 'edit_deployment') {
			const result = await verifyProjectPassword(project.id, inputPassword);
			if (result.success) {
				if (passwordModalMode === 'add_deployment') {
					setIsPasswordModalOpen(false);
					setIsAddingDeployment(true);
				} else if (passwordModalMode === 'edit_deployment') {
					setIsPasswordModalOpen(false);
					// Set editing state
					const logToEdit = deployments.find(d => d.id === editingDeploymentId); // editingDeploymentId set on click
					if (logToEdit) {
						setEditVersion(logToEdit.version || '');
						setEditLogContent(logToEdit.content || '');
						// Force re-render of that item in edit mode (we use editingDeploymentId for UI control)
					}
				} else {
					// delete_deployment
					setIsPasswordModalOpen(false);
					// Open confirm modal? or just delete?
					// Let's use Confirm Modal effectively
					// But confirm modal currently is hardcoded for comments in some generic way?
					// Let's update ConfirmModal props to be dynamic.
					setIsConfirmModalOpen(true);
				}
				return true;
			} else {
				return result;
			}
		}
	};

	const handleSaveEdit = async () => {
		if (!editContent.trim()) return;

		if (checkProfanity(editContent)) {
			alert("비속어가 포함된 댓글은 등록할 수 없습니다. 바르고 고운 말을 써주세요! 😊");
			return;
		}

		console.log("Updating comment:", editingId);
		const result = await updateComment(project.id, editingId, editPassword, editContent);
		if (result.success) {
			setEditingId(null);
			setEditPassword('');
			setEditContent('');
			if (showToast) showToast("댓글이 수정되었습니다!", 'success');
		} else {
			if (showToast) showToast("댓글 수정에 실패했습니다.", 'error');
		}
	};

	const handleCancelEdit = () => {
		setEditingId(null);
		setEditPassword('');
		setEditContent('');
	};




	const handleConfirmDelete = async () => {
		if (deleteTargetId && pendingDeletePassword) {
			await deleteComment(project.id, deleteTargetId, pendingDeletePassword);
			setDeleteTargetId(null);
			setPendingDeletePassword(null);
			if (showToast) showToast("댓글이 삭제되었습니다!", 'success');
		} else if (passwordModalMode === 'delete_deployment' && deleteTargetId) {
			// Confirm delete deployment
			await deleteDeploymentLog(project.id, deleteTargetId);
			setDeleteTargetId(null);
			setPasswordModalMode('delete'); // Reset to default
			if (showToast) showToast("배포 기록이 삭제되었습니다!", 'success');
		}
	};

	// Deployment Handlers
	const handleAddDeployment = async () => {
		if (!newVersion.trim() || !newLogContent.trim()) return;

		if (!VERSION_REGEX.test(newVersion)) {
			if (showToast) showToast("버전 형식이 올바르지 않습니다. (예: 1.0.0)", 'error');
			return;
		}

		const result = await addDeploymentLog(project.id, {
			version: newVersion,
			content: newLogContent
		});

		if (result.success) {
			setIsAddingDeployment(false);
			setNewVersion('');
			setNewLogContent('');
			setDeploymentPassword('');
			// Reset limit to see the new one if we were on older page? Or just keep it.
			// Let's reset to show the top one clearly or just leave it.
			if (showToast) showToast("새 버전이 등록되었습니다!", 'success');
		} else {
			if (showToast) showToast("버전 등록에 실패했습니다.", 'error');
		}
	};

	const handleDeleteDeploymentClick = (logId) => {
		setDeleteTargetId(logId);
		setPasswordModalMode('delete_deployment');
		setIsPasswordModalOpen(true);
	};

	const handleEditDeploymentClick = (logId) => {
		setEditingDeploymentId(logId);
		setPasswordModalMode('edit_deployment');
		setIsPasswordModalOpen(true);
	};

	const handleCancelDeploymentEdit = () => {
		setEditingDeploymentId(null);
		setEditVersion('');
		setEditLogContent('');
	};

	const handleSaveDeploymentEdit = async () => {
		if (!editVersion.trim() || !editLogContent.trim()) return;

		if (!VERSION_REGEX.test(editVersion)) {
			if (showToast) showToast("버전 형식이 올바르지 않습니다. (예: 1.0.0)", 'error');
			return;
		}

		const result = await updateDeploymentLog(project.id, editingDeploymentId, {
			version: editVersion,
			content: editLogContent
		});

		if (result.success) {
			setEditingDeploymentId(null);
			setEditVersion('');
			setEditLogContent('');
			if (showToast) showToast("배포 기록이 수정되었습니다!", 'success');
		} else {
			if (showToast) showToast("수정에 실패했습니다.", 'error');
		}
	};


	if (!isOpen || !project) return null;

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
						className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
					/>
					<motion.div
						initial={{ opacity: 0, scale: 0.95, y: 20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.95, y: 20 }}
						className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
					>
						<div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl pointer-events-auto flex flex-col max-h-[90vh] overflow-hidden">
							{/* Header */}
							<div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 z-10">
								<h2 className="text-xl font-bold text-gray-900 dark:text-white truncate pr-4">
									{project.title}
								</h2>
								<button
									onClick={onClose}
									className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400"
								>
									<X className="w-6 h-6" />
								</button>
							</div>

							<div className="flex-1 overflow-y-auto">
								<div className="flex flex-col">
									{/* Top: Project Details */}
									<div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
										<div className="rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700 mb-6 bg-white dark:bg-gray-800">
											{project.imageUrl ? (
												<img src={project.imageUrl} alt={project.title} className="w-full h-auto object-cover max-h-[400px]" />
											) : (
												<div className="aspect-video flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
													이미지 없음
												</div>
											)}
										</div>

										<div className="flex flex-wrap gap-2 mb-4">
											{project.team && (
												<span className="bg-kakao-black text-white px-3 py-1 rounded-full text-sm font-bold">
													{project.team}
												</span>
											)}
											{project.tags && project.tags.map((tag, i) => (
												<span key={i} className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium border border-blue-200 dark:border-blue-800">
													#{tag}
												</span>
											))}
										</div>

										<div className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 leading-relaxed mb-8 break-all">
											<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{preprocessMarkdown(project.description)}</ReactMarkdown>
										</div>

										<div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
											<h4 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
												<User className="w-4 h-4" /> 팀원
											</h4>
											<div className="flex flex-wrap gap-2">
												{project.members && project.members.map((m, i) => (
													<span key={i} className="text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md">
														{m}
													</span>
												))}
											</div>
										</div>

										<div className="mt-6">
											<a href={project.url} target="_blank" rel="noopener noreferrer" className="block w-full bg-kakao-yellow text-kakao-black text-center py-3 rounded-xl font-bold hover:bg-yellow-400 transition-colors">
												서비스 보러가기
											</a>
										</div>
									</div>

									{/* Release Notes Section */}
									<div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
										<div className="flex items-center justify-between mb-4">
											<h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
												<Calendar className="w-5 h-5" />
												배포 기록
											</h3>
											<button
												onClick={() => {
													setPasswordModalMode('add_deployment');
													setIsPasswordModalOpen(true);
												}}
												className="text-sm px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
											>
												+ 버전 추가
											</button>
										</div>

										{isAddingDeployment && (
											<div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-2">
												<h4 className="font-bold text-gray-900 dark:text-white mb-3 text-sm">새 버전 기록 추가</h4>
												<div className="space-y-3">
													<div>
														<label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">버전</label>
														<input
															type="text"
															value={newVersion}
															onChange={(e) => {
																const val = e.target.value.replace(/[^0-9.]/g, ''); // Allow only numbers and dots
																setNewVersion(val);
															}}
															placeholder="Example: 1.0.0"
															className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
														/>
														<p className="text-[10px] text-gray-400 mt-1">Major.Minor.Patch 형식 (예: 1.0.0)</p>
													</div>
													<div>
														<label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">업데이트 내용</label>
														<textarea
															value={newLogContent}
															onChange={(e) => setNewLogContent(e.target.value)}
															placeholder="주요 변경 사항을 입력해주세요. (Markdown 지원)"
															rows={6}
															className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
														/>
													</div>
													<div className="flex justify-end gap-2 pt-2">
														<button
															onClick={() => {
																setIsAddingDeployment(false);
																setNewVersion('');
																setNewLogContent('');
																setDeploymentPassword('');
															}}
															className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
														>
															취소
														</button>
														<button
															onClick={handleAddDeployment}
															disabled={!newVersion.trim() || !newLogContent.trim()}
															className="px-4 py-1.5 text-sm font-bold bg-kakao-yellow text-kakao-black rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
														>
															등록
														</button>
													</div>
												</div>
											</div>
										)}

										<div className="space-y-4">
											{deployments.length === 0 ? (
												<div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
													아직 등록된 배포 기록이 없습니다.
												</div>
											) : (
												deployments.map((log) => (
													<div key={log.id} className="relative pl-4 border-l-2 border-gray-200 dark:border-gray-700 py-1 group">
														<div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 ring-4 ring-white dark:ring-gray-800 group-hover:bg-kakao-yellow transition-colors"></div>

														{editingDeploymentId === log.id ? (
															// Inline Edit Mode for Deployment
															<div className="space-y-3 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-dashed border-kakao-yellow">
																<div>
																	<label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">버전</label>
																	<input
																		type="text"
																		value={editVersion}
																		onChange={(e) => {
																			const val = e.target.value.replace(/[^0-9.]/g, '');
																			setEditVersion(val);
																		}}
																		className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
																	/>
																</div>
																<div>
																	<label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">내용</label>
																	<textarea
																		value={editLogContent}
																		onChange={(e) => setEditLogContent(e.target.value)}
																		rows={5}
																		className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
																	/>
																</div>
																<div className="flex justify-end gap-2 text-xs">
																	<button onClick={handleCancelDeploymentEdit} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700">취소</button>
																	<button onClick={handleSaveDeploymentEdit} className="px-3 py-1.5 bg-kakao-yellow text-kakao-black rounded-md hover:bg-yellow-400 font-bold">저장</button>
																</div>
															</div>
														) : (
															<>
																<div className="flex justify-between items-start">
																	<div>
																		<h4 className="font-bold text-gray-900 dark:text-white text-sm">
																			{log.version}
																		</h4>
																		<p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
																			{log.createdAt?.seconds ? new Date(log.createdAt.seconds * 1000).toLocaleDateString() : '방금 전'}
																		</p>
																	</div>
																	<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
																		<button
																			onClick={() => handleEditDeploymentClick(log.id)}
																			className="p-1 text-gray-300 hover:text-blue-500 transition-colors"
																			title="수정"
																		>
																			<Edit2 className="w-3.5 h-3.5" />
																		</button>
																		<button
																			onClick={() => handleDeleteDeploymentClick(log.id)}
																			className="p-1 text-gray-300 hover:text-red-500 transition-colors"
																			title="삭제"
																		>
																			<Trash2 className="w-3.5 h-3.5" />
																		</button>
																	</div>
																</div>
																<div className="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
																	<ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
																		{preprocessMarkdown(log.content)}
																	</ReactMarkdown>
																</div>
															</>
														)}
													</div>
												))
											)}

											{/* Show More Button */}
											{deployments.length < totalDeployments && (
												<button
													onClick={() => setDeployLimit(prev => prev + SHOW_MORE_COUNT)}
													className="w-full py-2 text-xs font-bold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-dashed border-gray-200 dark:border-gray-600"
												>
													더보기 ({totalDeployments - deployments.length}개 남음)
												</button>
											)}
										</div>
									</div>

									{/* Bottom: Comments */}
									<div className="flex flex-col bg-white dark:bg-gray-800">
										<div className="p-6 pb-0">
											<h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
												댓글 <span className="text-kakao-yellow">{comments.length}</span>
											</h3>
										</div>

										{/* Comment Form (Moved to Top) */}
										<div className="px-6 pb-6">
											<form onSubmit={handleCommentSubmit} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700">
												<div className="grid grid-cols-2 gap-2 mb-2">
													<input
														type="text"
														placeholder="작성자 이름"
														value={authorName}
														onChange={(e) => setAuthorName(e.target.value)}
														required
														className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
													/>
													<input
														type="password"
														placeholder="비밀번호 (숫자 4~6자리)"
														value={password}
														onChange={(e) => {
															const val = e.target.value.replace(/[^0-9]/g, '');
															setPassword(val);
														}}
														required
														maxLength={6}
														inputMode="numeric"
														pattern="[0-9]*"
														autoComplete="new-password"
														className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
													/>
												</div>
												<div className="flex gap-2">
													<div className="flex-1 relative">
														<input
															type="text"
															placeholder="응원의 댓글을 남겨주세요! (최대 100자, 비속어 금지)"
															value={newComment}
															onChange={(e) => setNewComment(e.target.value)}
															required
															maxLength={100}
															className="w-full pl-4 pr-16 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
														/>
														<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500 font-medium">
															{newComment.length}/100
														</span>
													</div>
													<button
														type="submit"
														disabled={isSubmitting}
														className="bg-kakao-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
													>
														<Send className="w-4 h-4" />
													</button>
												</div>
											</form>
										</div>

										{/* Comment List */}
										<div className="px-6 space-y-4 mb-8">
											{comments.length === 0 ? (
												<div className="text-center text-gray-400 dark:text-gray-500 py-8 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
													첫 번째 댓글을 남겨주세요! 👋
												</div>
											) : (
												comments.map((comment) => (
													<div key={comment.id} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 group hover:shadow-sm transition-shadow">
														{editingId === comment.id ? (
															// Inline Edit Mode
															<div className="space-y-2">
																<div className="flex items-center justify-between mb-2">
																	<span className="font-bold text-sm text-gray-900">{comment.author}</span>
																	<span className="text-xs text-kakao-brown font-bold animate-pulse">수정 중...</span>
																</div>
																<div className="relative">
																	<textarea
																		value={editContent}
																		onChange={(e) => setEditContent(e.target.value)}
																		className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kakao-yellow text-gray-900 dark:text-white"
																		rows={3}
																		maxLength={100}
																	/>
																	<span className="absolute right-3 bottom-3 text-xs text-gray-400 dark:text-gray-500 font-medium bg-white/80 dark:bg-gray-800/80 px-1 rounded">
																		{editContent.length}/100
																	</span>
																</div>
																<div className="flex justify-end gap-2 mt-2">
																	<button
																		onClick={handleCancelEdit}
																		className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md transition-colors flex items-center gap-1"
																	>
																		<XCircle className="w-3 h-3" /> 취소
																	</button>
																	<button
																		onClick={handleSaveEdit}
																		className="px-3 py-1.5 text-xs font-bold text-kakao-black bg-kakao-yellow rounded-md hover:bg-yellow-400 transition-colors flex items-center gap-1"
																	>
																		<Check className="w-3 h-3" /> 저장
																	</button>
																</div>
															</div>
														) : (
															// Normal View Mode
															<>
																<div className="flex justify-between items-start mb-2">
																	<div className="flex items-center gap-2">
																		<span className="font-bold text-sm text-gray-900 dark:text-white">{comment.author}</span>
																		<span className="text-xs text-gray-400 dark:text-gray-500">
																			{comment.createdAt?.seconds ? new Date(comment.createdAt.seconds * 1000).toLocaleDateString() : '방금 전'}
																		</span>
																		{comment.updatedAt && (
																			<span className="text-xs text-gray-400">(수정됨)</span>
																		)}
																	</div>
																	<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
																		<button
																			onClick={() => handleEditClick(comment.id)}
																			className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
																			title="수정"
																		>
																			<Edit2 className="w-4 h-4" />
																		</button>
																		<button
																			onClick={() => handleDeleteClick(comment.id)}
																			className="p-1 text-gray-400 hover:text-red-500 transition-colors"
																			title="삭제"
																		>
																			<Trash2 className="w-4 h-4" />
																		</button>
																	</div>
																</div>
																<p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap break-all">{comment.content}</p>
															</>
														)}
													</div>
												))
											)}
										</div>
									</div>
								</div>
							</div>
						</div>
					</motion.div>

					<PasswordModal
						isOpen={isPasswordModalOpen}
						onClose={() => setIsPasswordModalOpen(false)}
						onVerify={handlePasswordVerify}
						title={
							passwordModalMode === 'delete' ? "댓글 삭제" :
								passwordModalMode === 'edit' ? "댓글 수정" :
									passwordModalMode === 'add_deployment' ? "버전 추가 (관리자)" :
										passwordModalMode === 'delete_deployment' ? "버전 삭제 (관리자)" : "버전 수정 (관리자)"
						}
						description={
							passwordModalMode === 'delete' ? "댓글을 삭제하려면 비밀번호를 입력하세요." :
								passwordModalMode === 'edit' ? "댓글 내용을 수정하려면 비밀번호를 입력하세요." :
									"프로젝트 비밀번호를 입력하세요."
						}
					/>

					<ConfirmModal
						isOpen={isConfirmModalOpen}
						onClose={() => setIsConfirmModalOpen(false)}
						onConfirm={handleConfirmDelete}
						title={passwordModalMode === 'delete_deployment' ? "배포 기록 삭제" : "댓글 삭제"}
						description={passwordModalMode === 'delete_deployment' ? "정말로 이 배포 기록을 삭제하시겠습니까?" : "정말로 댓글을 삭제하시겠습니까?\n삭제된 댓글은 복구할 수 없습니다."}
						confirmText="삭제하기"
						isDangerous={true}
					/>
				</>
			)
			}
		</AnimatePresence >
	);
};

export default ProjectDetailModal;
