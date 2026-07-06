import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, Sparkles, Wand2, Upload, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { addProject, updateProject, uploadThumbnailFromUrl, uploadThumbnailFromFile } from '../lib/firebase';

const RegisterModal = ({ isOpen, onClose, initialData = null, onSuccess, defaultGeneration = 4, generations = [] }) => {
	const [loading, setLoading] = useState(false);
	const [fetchingOg, setFetchingOg] = useState(false);
	const [uploadingThumb, setUploadingThumb] = useState(false);
	const [imageFile, setImageFile] = useState(null);       // 사용자가 선택한 로컬 파일
	const [imagePreview, setImagePreview] = useState('');   // 파일 미리보기 URL
	const fileInputRef = useRef(null);
	const [formData, setFormData] = useState({
		title: '',
		description: '',
		team: '',
		members: '',
		url: '',
		imageUrl: '',
		password: '',
		tags: [],
		generation: defaultGeneration
	});
	const [tagInput, setTagInput] = useState('');

	// Reset or populate form when opening/closing
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = 'hidden';
			if (initialData) {
				setFormData({
					title: initialData.title || '',
					description: initialData.description || '',
					team: initialData.team || '',
					members: initialData.members ? initialData.members.join(', ') : '',
					url: initialData.url || '',
					imageUrl: initialData.imageUrl || '',
					password: initialData.password || '',
					tags: initialData.tags || [],
					generation: initialData.generation || defaultGeneration
				});
			} else {
				setFormData({
					title: '',
					description: '',
					team: '',
					members: '',
					url: '',
					imageUrl: '',
					password: '',
					tags: [],
					generation: defaultGeneration
				});
				setTagInput('');
			}
			// 파일 상태 초기화
			setImageFile(null);
			setImagePreview('');
		}

		return () => {
			document.body.style.overflow = 'unset';
		};
	}, [isOpen, initialData, defaultGeneration]);

	const handleChange = (e) => {
		setFormData({
			...formData,
			[e.target.name]: e.target.value
		});
	};

	const handleTagKeyDown = (e) => {
		if (e.key === 'Enter') {
			if (e.nativeEvent.isComposing) return; // Prevent IME duplicate trigger
			e.preventDefault();
			const newTag = tagInput.trim();
			if (newTag && formData.tags.length < 3 && !formData.tags.includes(newTag)) {
				setFormData(prev => ({
					...prev,
					tags: [...prev.tags, newTag]
				}));
				setTagInput('');
			} else if (formData.tags.length >= 3) {
				alert('태그는 최대 3개까지만 등록 가능합니다.');
			}
		}
	};

	const removeTag = (tagToRemove) => {
		setFormData(prev => ({
			...prev,
			tags: prev.tags.filter(tag => tag !== tagToRemove)
		}));
	};

	const fetchOgImage = async () => {
		if (!formData.url) return;

		setFetchingOg(true);
		try {
			const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(formData.url)}`);
			const data = await response.json();

			if (data.status === 'success' && data.data.image) {
				setFormData(prev => ({
					...prev,
					imageUrl: data.data.image.url
				}));
				// URL로 이미지를 가져온 경우 파일 선택 초기화
				setImageFile(null);
				setImagePreview('');
			} else {
				alert('이미지를 찾을 수 없습니다. 직접 입력해주세요.');
			}
		} catch (error) {
			console.error("OG Fetch Error:", error);
			alert('이미지 정보를 불러오는데 실패했습니다.');
		} finally {
			setFetchingOg(false);
		}
	};

	/** 로컬 파일 선택 핸들러 */
	const handleFileSelect = (e) => {
		const file = e.target.files?.[0];
		if (!file || !file.type.startsWith('image/')) return;
		const previewUrl = URL.createObjectURL(file);
		// 이전 미리보기 URL 해제
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		setImageFile(file);
		setImagePreview(previewUrl);
	};

	const clearImageFile = () => {
		if (imagePreview) URL.revokeObjectURL(imagePreview);
		setImageFile(null);
		setImagePreview('');
		if (fileInputRef.current) fileInputRef.current.value = '';
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);

		const submissionData = {
			...formData,
			generation: Number(formData.generation),
			members: formData.members.split(',').map(m => m.trim()).filter(Boolean)
		};

		const projectId = initialData?.id || `proj_${Date.now()}`;
		const imageChanged = initialData && formData.imageUrl !== initialData.imageUrl;

		setUploadingThumb(true);
		try {
			if (imageFile) {
				// ✅ 로컬 파일 업로드 - CORS 없음, 확실하게 작동
				const cdnUrl = await uploadThumbnailFromFile(imageFile, projectId);
				if (cdnUrl) {
					submissionData.imageUrl = cdnUrl;      // 원본도 CDN URL로 교체
					submissionData.thumbnailUrl = cdnUrl;
				}
			} else if (formData.imageUrl) {
				// URL 방식: 변경됐거나 thumbnailUrl이 없을 때만 업로드 시도
				const needsUpload = !initialData || imageChanged || !initialData.thumbnailUrl;
				if (needsUpload) {
					const cdnUrl = await uploadThumbnailFromUrl(formData.imageUrl, projectId);
					if (cdnUrl) submissionData.thumbnailUrl = cdnUrl;
				} else if (initialData?.thumbnailUrl) {
					submissionData.thumbnailUrl = initialData.thumbnailUrl;
				}
			}
		} finally {
			setUploadingThumb(false);
		}

		let result;
		if (initialData) {
			result = await updateProject(initialData.id, submissionData);
		} else {
			result = await addProject(submissionData);
		}

		setLoading(false);

		if (result.success) {
			if (onSuccess) onSuccess(initialData ? '프로젝트가 수정되었습니다!' : '프로젝트가 등록되었습니다!');
			onClose();
		} else {
			alert('저장에 실패했습니다. 다시 시도해주세요.');
		}
	};

	return (
		<AnimatePresence>
			{isOpen && (
				<>
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
						className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
					/>
					<motion.div
						initial={{ opacity: 0, scale: 0.95, y: 20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.95, y: 20 }}
						className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
					>
						<div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-xl pointer-events-auto flex flex-col max-h-[90vh]">
							<div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0">
								<h2 className="text-xl font-bold text-gray-900 dark:text-white">
									{initialData ? '프로젝트 수정' : '새 프로젝트 등록'}
								</h2>
								<button
									onClick={onClose}
									className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400"
								>
									<X className="w-5 h-5" />
								</button>
							</div>

							<div className="overflow-y-auto p-6">
								<form id="project-form" onSubmit={handleSubmit} className="space-y-4">
									<div className="grid grid-cols-3 gap-4">
										<div>
											<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
												기수 선택 *
											</label>
											<select
												name="generation"
												value={formData.generation}
												onChange={handleChange}
												className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold cursor-pointer h-[42px]"
											>
												{generations.map((gen) => (
													<option key={gen.value} value={gen.value}>
														{gen.name}
													</option>
												))}
											</select>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
												팀 이름 (예: 1조) *
											</label>
											<input
												type="text"
												name="team"
												required
												value={formData.team}
												onChange={handleChange}
												className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
												placeholder="1조 (최대 20자)"
												maxLength={20}
											/>
										</div>
										<div>
											<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
												비밀번호{initialData && ' (수정 불가)'} *
											</label>
											<input
												type="password"
												name="password"
												required
												maxLength={6}
												disabled={!!initialData}
												value={formData.password}
												onChange={handleChange}
												autoComplete="new-password"
												className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
												placeholder="숫자 4~6자리"
											/>
										</div>
									</div>

									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
											팀원 이름 (콤마로 구분) *
										</label>
										<input
											type="text"
											name="members"
											required
											value={formData.members}
											onChange={handleChange}
											className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
											placeholder="김철수, 이영희, 박지성"
										/>
									</div>

									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
											프로젝트 태그 (최대 3개)
										</label>
										<div className="flex flex-wrap gap-2 mb-2">
											{formData.tags.map((tag, index) => (
												<span key={index} className="bg-gray-100 text-gray-800 px-2 py-1 rounded-md text-sm flex items-center gap-1">
													{tag}
													<button
														type="button"
														onClick={() => removeTag(tag)}
														className="hover:text-red-500"
													>
														<X className="w-3 h-3" />
													</button>
												</span>
											))}
										</div>
										<input
											type="text"
											value={tagInput}
											onChange={(e) => setTagInput(e.target.value)}
											onKeyDown={handleTagKeyDown}
											disabled={formData.tags.length >= 3}
											className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:placeholder-gray-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
											placeholder={formData.tags.length >= 3 ? "태그는 3개까지만 가능합니다" : "태그 입력 후 엔터"}
										/>
									</div>

									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
											프로젝트 이름 *
										</label>
										<input
											type="text"
											name="title"
											required
											value={formData.title}
											onChange={handleChange}
											className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
											placeholder="프로젝트 이름을 입력하세요 (최대 20자)"
											maxLength={20}
										/>
									</div>

									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
											상세 소개 (Markdown 지원) *
										</label>
										<textarea
											name="description"
											required
											value={formData.description}
											onChange={handleChange}
											className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all resize-none h-48 font-mono text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
											placeholder="프로젝트에 대해 자세히 설명해주세요. 마크다운 문법을 지원합니다. (최대 3000자)"
											maxLength={3000}
										/>
									</div>

									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
											서비스 URL *
										</label>
										<div className="flex space-x-2">
											<input
												type="url"
												name="url"
												required
												value={formData.url}
												onChange={handleChange}
												className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
												placeholder="https://example.com"
											/>
											<button
												type="button"
												onClick={fetchOgImage}
												disabled={fetchingOg || !formData.url}
												className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 flex items-center space-x-1 whitespace-nowrap"
												title="URL에서 이미지 자동 가져오기"
											>
												{fetchingOg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
												<span className="text-sm font-medium">이미지 가져오기</span>
											</button>
										</div>
									</div>

									<div>
										<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
											이미지 URL
										</label>
										<input
											type="url"
											name="imageUrl"
											value={formData.imageUrl}
											onChange={handleChange}
											className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-kakao-yellow focus:border-transparent outline-none transition-all bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
											placeholder="자동으로 가져오거나 직접 입력하세요 (이미지 썸네일 처리 미지원)"
										/>
										{/* 파일 업로드 영역 */}
										<div className="mt-2">
											<input
												ref={fileInputRef}
												type="file"
												accept="image/*"
												onChange={handleFileSelect}
												className="hidden"
												id="thumbnail-file-input"
											/>
											{imageFile ? (
												<div className="flex items-center gap-2 mt-1.5 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
													<Upload className="w-4 h-4 text-green-600 flex-shrink-0" />
													<span className="text-xs text-green-700 dark:text-green-400 font-medium truncate flex-1">{imageFile.name}</span>
													<span className="text-xs text-green-600 dark:text-green-500 flex-shrink-0">→ Firebase Storage</span>
													<button type="button" onClick={clearImageFile} className="text-green-500 hover:text-red-500 transition-colors flex-shrink-0">
														<XCircle className="w-4 h-4" />
													</button>
												</div>
											) : (
												<label
													htmlFor="thumbnail-file-input"
													className="mt-1.5 flex items-center justify-center gap-2 w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-kakao-yellow hover:bg-yellow-50/50 dark:hover:bg-yellow-900/10 transition-colors"
												>
													<Upload className="w-4 h-4 text-gray-400" />
													<span className="text-xs text-gray-500">또는 파일 직접 업로드</span>
												</label>
											)}
										</div>
										{/* 미리보기: 파일 선택 시 파일 프리뷰, URL만 있을 때 URL 프리뷰 */}
										{(imagePreview || formData.imageUrl) && (
											<div className="mt-2 relative rounded-lg overflow-hidden border border-gray-200 aspect-video bg-gray-50">
												<img
													src={imagePreview || formData.imageUrl}
													alt="Preview"
													className="w-full h-full object-cover"
												/>
												{imagePreview && (
													<div className="absolute bottom-1.5 right-1.5 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
														로컬 파일 ✓
													</div>
												)}
											</div>
										)}
									</div>

								</form>
							</div>

							<div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex-shrink-0">
								<button
									type="submit"
									form="project-form"
									disabled={loading || uploadingThumb}
									className="w-full bg-kakao-yellow text-kakao-black py-3 rounded-lg font-bold hover:bg-yellow-400 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
								>
									{uploadingThumb ? (
										<>
											<Loader2 className="w-5 h-5 animate-spin" />
											<span>썸네일 업로드 중...</span>
										</>
									) : loading ? (
										<>
											<Loader2 className="w-5 h-5 animate-spin" />
											<span>저장 중...</span>
										</>
									) : (
										<span>{initialData ? '수정 완료' : '등록하기'}</span>
									)}
								</button>
							</div>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
};

export default RegisterModal;
