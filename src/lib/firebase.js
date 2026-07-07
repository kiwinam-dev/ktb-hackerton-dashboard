import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
	apiKey: "AIzaSyCm0Bul1xpqu6SejQyEJKlvRtarWSc7Jv0",
	authDomain: "ktb-project-dashboard.firebaseapp.com",
	projectId: "ktb-project-dashboard",
	storageBucket: "ktb-project-dashboard.firebasestorage.app",
	messagingSenderId: "223321006077",
	appId: "1:223321006077:web:afbf57c9a724f8f818c394",
	measurementId: "G-CZBSB4PET4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

/**
 * 외부 이미지 URL을 fetch → Blob URL 변환 → Canvas 리사이즈 후
 * Firebase Storage에 WebP로 업로드하고 Download URL을 반환합니다.
 *
 * CORS 우회 전략:
 * 1) 직접 fetch 시도 (CORS 허용 서버는 바로 성공)
 * 2) 실패 시 corsproxy.io 경유 fetch (GitHub 등 CORS 미지원 서버)
 * Blob URL은 same-origin으로 처리되므로 Canvas taint 없이 toBlob() 가능.
 *
 * @param {string} imageUrl  - 원본 이미지 URL
 * @param {string} projectId - 프로젝트 ID (Storage 경로에 사용)
 * @returns {Promise<string|null>} CDN Download URL 또는 null
 */
export const uploadThumbnailFromUrl = async (imageUrl, projectId) => {
	const MAX_SIZE = 640;
	const QUALITY  = 0.82;

	/**
	 * 이미지를 fetch해서 Blob으로 반환.
	 * 직접 fetch 실패 시 images.weserv.nl (이미지 전용 CDN 프록시, GitHub 지원) 경유.
	 * weserv.nl은 서버에서 최대 640px WebP 리사이즈까지 처리해주므로
	 * 프록시 경유 시에는 Canvas 리사이즈 단계도 생략합니다.
	 * @returns {{ blob: Blob, alreadyResized: boolean }}
	 */
	const fetchAsBlob = async (url) => {
		// 1차: 직접 fetch (CORS 허용 서버)
		try {
			const res = await fetch(url);
			if (res.ok) return { blob: await res.blob(), alreadyResized: false };
		} catch (_) { /* CORS or network error → proxy fallback */ }

		// 2차: images.weserv.nl - 이미지 전용 CDN 프록시 (GitHub, Twitter 등 지원)
		// 서버 사이드 리사이즈(w=640, WebP, q=82) + CORS 헤더 자동 추가
		try {
			const weservUrl = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${MAX_SIZE}&output=webp&q=${Math.round(QUALITY * 100)}&maxage=7d`;
			const res = await fetch(weservUrl);
			if (res.ok) return { blob: await res.blob(), alreadyResized: true }; // 이미 리사이즈됨
		} catch (_) { /* proxy error → next fallback */ }

		// 3차: allorigins.win (범용 CORS 프록시)
		try {
			const alloriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
			const res = await fetch(alloriginsUrl);
			if (res.ok) return { blob: await res.blob(), alreadyResized: false };
		} catch (_) { /* all proxies failed */ }

		throw new Error('모든 프록시 시도 실패 - 원본 URL 유지');
	};

	/** Blob → Blob URL → Canvas 리사이즈 → 결과 Blob */
	const resizeBlob = (srcBlob) => new Promise((resolve, reject) => {
		const blobUrl = URL.createObjectURL(srcBlob);
		const img = new Image();

		img.onload = () => {
			URL.revokeObjectURL(blobUrl); // 메모리 해제

			let { naturalWidth: w, naturalHeight: h } = img;
			if (w > MAX_SIZE || h > MAX_SIZE) {
				if (w >= h) { h = Math.round((h * MAX_SIZE) / w); w = MAX_SIZE; }
				else        { w = Math.round((w * MAX_SIZE) / h); h = MAX_SIZE; }
			}

			const canvas = document.createElement('canvas');
			canvas.width  = w;
			canvas.height = h;
			canvas.getContext('2d').drawImage(img, 0, 0, w, h);

			// WebP 지원 여부 확인
			const mimeType = canvas.toDataURL('image/webp').startsWith('data:image/webp')
				? 'image/webp' : 'image/jpeg';

			canvas.toBlob(
				(b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
				mimeType,
				QUALITY
			);
		};

		img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('Image render failed')); };
		img.src = blobUrl; // Blob URL은 same-origin → crossOrigin 불필요
	});

	try {
		const { blob: srcBlob, alreadyResized } = await fetchAsBlob(imageUrl);

		// 프록시가 이미 리사이즈한 경우(weserv.nl) Canvas 단계 생략
		const thumbBlob = alreadyResized ? srcBlob : await resizeBlob(srcBlob);

		const ext        = thumbBlob.type === 'image/webp' ? 'webp' : 'jpg';
		const path       = `thumbnails/${projectId}/${Date.now()}.${ext}`;
		const storageRef = ref(storage, path);

		await uploadBytes(storageRef, thumbBlob, { contentType: thumbBlob.type });
		return await getDownloadURL(storageRef);
	} catch (error) {
		console.warn('썸네일 업로드 실패 (원본 URL 유지):', error.message);
		return null;
	}
};

/**
 * 로컬 File 객체를 받아 썸네일 사이즈(최대 640px)로 리사이즈한 뒤
 * Firebase Storage에 WebP로 업로드하고 Download URL을 반환합니다.
 *
 * 로컬 파일은 Blob URL(same-origin)로 처리되므로 CORS 문제가 없습니다.
 *
 * @param {File}   file      - 업로드할 이미지 File 객체
 * @param {string} projectId - 프로젝트 ID (Storage 경로에 사용)
 * @returns {Promise<string|null>} CDN Download URL 또는 null
 */
export const uploadThumbnailFromFile = async (file, projectId) => {
	const MAX_SIZE = 640;
	const QUALITY  = 0.82;

	try {
		// File → Blob URL (same-origin, CORS 없음)
		const blobUrl = URL.createObjectURL(file);

		const thumbBlob = await new Promise((resolve, reject) => {
			const img = new Image();

			img.onload = () => {
				URL.revokeObjectURL(blobUrl); // 즉시 해제

				let { naturalWidth: w, naturalHeight: h } = img;
				if (w > MAX_SIZE || h > MAX_SIZE) {
					if (w >= h) { h = Math.round((h * MAX_SIZE) / w); w = MAX_SIZE; }
					else        { w = Math.round((w * MAX_SIZE) / h); h = MAX_SIZE; }
				}

				const canvas = document.createElement('canvas');
				canvas.width  = w;
				canvas.height = h;
				canvas.getContext('2d').drawImage(img, 0, 0, w, h);

				const mimeType = canvas.toDataURL('image/webp').startsWith('data:image/webp')
					? 'image/webp' : 'image/jpeg';

				canvas.toBlob(
					(b) => b ? resolve(b) : reject(new Error('Canvas toBlob 실패')),
					mimeType,
					QUALITY
				);
			};

			img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('이미지 렌더링 실패')); };
			img.src = blobUrl;
		});

		const ext        = thumbBlob.type === 'image/webp' ? 'webp' : 'jpg';
		const path       = `thumbnails/${projectId}/${Date.now()}.${ext}`;
		const storageRef = ref(storage, path);

		await uploadBytes(storageRef, thumbBlob, { contentType: thumbBlob.type });
		return await getDownloadURL(storageRef);
	} catch (error) {
		console.warn('파일 썸네일 업로드 실패:', error.message);
		return null;
	}
};




import {
	collection,
	addDoc,
	onSnapshot,
	query,
	where,
	orderBy,
	serverTimestamp,
	doc,
	deleteDoc,
	updateDoc,
	increment,
	getDoc,
	getCountFromServer,
	limit,
	getDocs,
	setDoc,
	arrayUnion,
	arrayRemove,
	runTransaction,
	writeBatch
} from "firebase/firestore";
import { hashPassword } from "./crypto";

const COLLECTION_NAME = "projects";
const PROJECT_SECRETS_COLLECTION = "project_secrets";
const COMMENT_SECRETS_COLLECTION = "comment_secrets";

export const addProject = async (projectData) => {
	try {
		const { password, ...publicData } = projectData;
		const hashedPassword = await hashPassword(password);

		// 1. Add public project data
		const docRef = await addDoc(collection(db, COLLECTION_NAME), {
			...publicData,
			likes: 0,
			likedBy: [],
			createdAt: serverTimestamp(),
		});

		// 2. Add secret password data to separate collection with same ID
		await setDoc(doc(db, PROJECT_SECRETS_COLLECTION, docRef.id), {
			password: hashedPassword
		});

		return { success: true };
	} catch (error) {
		console.error("Error adding project: ", error);
		return { success: false, error };
	}
};

export const subscribeToProjects = (callback, onError) => {
	const q = query(collection(db, COLLECTION_NAME), orderBy("createdAt", "desc"));
	return onSnapshot(q,
		(snapshot) => {
			const projects = snapshot.docs.map((doc) => {
				const data = doc.data();
				// Ensure password is not leaked if it exists in data (legacy)
				const { password, ...safeData } = data;
				return {
					id: doc.id,
					...safeData,
				};
			});
			callback(projects);
		},
		(error) => {
			console.error("Firestore subscription error:", error);
			if (onError) onError(error);
		}
	);
};

export const updateProject = async (docId, data) => {
	try {
		const docRef = doc(db, COLLECTION_NAME, docId);
		await updateDoc(docRef, {
			...data,
			updatedAt: serverTimestamp(),
		});
		return { success: true };
	} catch (error) {
		console.error("Error updating project: ", error);
		return { success: false, error };
	}
};

export const toggleLike = async (docId, sessionId) => {
	try {
		const docRef = doc(db, COLLECTION_NAME, docId);
		const docSnap = await getDoc(docRef);

		if (docSnap.exists()) {
			const data = docSnap.data();
			const likedBy = data.likedBy || [];
			const hasLiked = likedBy.includes(sessionId);

			if (hasLiked) {
				await updateDoc(docRef, {
					likes: (data.likes || 1) - 1,
					likedBy: arrayRemove(sessionId)
				});
				return { liked: false };
			} else {
				await updateDoc(docRef, {
					likes: (data.likes || 0) + 1,
					likedBy: arrayUnion(sessionId)
				});
				return { liked: true };
			}
		}
	} catch (error) {
		console.error("Error toggling like:", error);
		return { error };
	}
};

export const addComment = async (projectId, commentData) => {
	try {
		const { password, ...publicData } = commentData;
		const hashedPassword = await hashPassword(password);

		// 1. Add public comment
		const docRef = await addDoc(collection(db, COLLECTION_NAME, projectId, "comments"), {
			...publicData,
			createdAt: serverTimestamp(),
		});

		// 2. Add secret password
		await setDoc(doc(db, COMMENT_SECRETS_COLLECTION, docRef.id), {
			password: hashedPassword,
			projectId: projectId // Optional: for reference if needed
		});

		// Update count
		const projectRef = doc(db, COLLECTION_NAME, projectId);
		await updateDoc(projectRef, {
			commentCount: increment(1)
		});

		return { success: true };
	} catch (error) {
		console.error("Error adding comment: ", error);
		return { success: false, error };
	}
};

export const subscribeToComments = (projectId, callback) => {
	const q = query(
		collection(db, COLLECTION_NAME, projectId, "comments"),
		orderBy("createdAt", "desc")
	);
	return onSnapshot(q, (snapshot) => {
		const comments = snapshot.docs.map((doc) => {
			const data = doc.data();
			const { password, ...safeData } = data; // Remove legacy password if present
			return {
				id: doc.id,
				...safeData,
			};
		});
		callback(comments);
	});
};

// Internal helper for verification
const _verifySecret = async (collectionName, docId, inputPassword, legacyDocRef = null) => {
	try {
		const inputHash = await hashPassword(inputPassword);
		const secretRef = doc(db, collectionName, docId);
		const secretSnap = await getDoc(secretRef);

		if (secretSnap.exists()) {
			// New secure path
			return secretSnap.data().password === inputHash;
		} else if (legacyDocRef) {
			// Fallback to legacy document
			const legacySnap = await getDoc(legacyDocRef);
			if (legacySnap.exists() && legacySnap.data().password === inputPassword) {
				return true;
			}
		}
		return false;
	} catch (e) {
		console.error("Verification error:", e);
		return false;
	}
};

export const deleteComment = async (projectId, commentId, password) => {
	try {
		const commentRef = doc(db, COLLECTION_NAME, projectId, "comments", commentId);

		const isValid = await _verifySecret(COMMENT_SECRETS_COLLECTION, commentId, password, commentRef);

		if (isValid) {
			await deleteDoc(commentRef);
			// Also try to delete secret, ignore error if doesn't exist
			try { await deleteDoc(doc(db, COMMENT_SECRETS_COLLECTION, commentId)); } catch (e) { }

			const projectRef = doc(db, COLLECTION_NAME, projectId);
			await updateDoc(projectRef, {
				commentCount: increment(-1)
			});
			return { success: true };
		} else {
			return { success: false, error: "Incorrect password" };
		}
	} catch (error) {
		console.error("Error deleting comment: ", error);
		return { success: false, error };
	}
};

export const updateComment = async (projectId, commentId, password, newContent) => {
	try {
		const commentRef = doc(db, COLLECTION_NAME, projectId, "comments", commentId);

		const isValid = await _verifySecret(COMMENT_SECRETS_COLLECTION, commentId, password, commentRef);

		if (isValid) {
			await updateDoc(commentRef, {
				content: newContent,
				updatedAt: serverTimestamp()
			});
			return { success: true };
		} else {
			return { success: false, error: "Incorrect password" };
		}
	} catch (error) {
		console.error("Error updating comment: ", error);
		return { success: false, error };
	}
};

// Rate Limiter Helper
const checkRateLimit = async (sessionId) => {
	const RATE_LIMIT_COLLECTION = "rate_limits";
	const limitRef = doc(db, RATE_LIMIT_COLLECTION, sessionId);

	try {
		const docSnap = await getDoc(limitRef);
		const now = Date.now();
		let timestamps = [];

		if (docSnap.exists()) {
			timestamps = docSnap.data().timestamps || [];
		}

		// Filter timestamps older than 1 minute
		timestamps = timestamps.filter(t => now - t < 60000);

		if (timestamps.length >= 5) {
			return { allowed: false, error: "너무 많은 시도를 했습니다.\n1분 후에 다시 시도해주세요." };
		}

		timestamps.push(now);
		await setDoc(limitRef, { timestamps });
		return { allowed: true };
	} catch (error) {
		console.error("Rate limit check error:", error);
		// Fail open if rate limit check fails, to not block users on system error
		return { allowed: true };
	}
};

export const verifyCommentPassword = async (projectId, commentId, password, sessionId) => {
	try {
		if (sessionId) {
			const limitCheck = await checkRateLimit(sessionId);
			if (!limitCheck.allowed) return { success: false, error: limitCheck.error };
		}

		const commentRef = doc(db, COLLECTION_NAME, projectId, "comments", commentId);
		const isValid = await _verifySecret(COMMENT_SECRETS_COLLECTION, commentId, password, commentRef);

		if (isValid) {
			return { success: true };
		} else {
			return { success: false, error: "비밀번호가 일치하지 않습니다." };
		}
	} catch (error) {
		console.error("Error verifying password: ", error);
		return { success: false, error };
	}
};

export const verifyProjectPassword = async (projectId, password, sessionId) => {
	try {
		if (sessionId) {
			const limitCheck = await checkRateLimit(sessionId);
			if (!limitCheck.allowed) return { success: false, error: limitCheck.error };
		}

		const projectRef = doc(db, COLLECTION_NAME, projectId);
		const isValid = await _verifySecret(PROJECT_SECRETS_COLLECTION, projectId, password, projectRef);

		if (isValid) {
			return { success: true };
		} else {
			return { success: false, error: "비밀번호가 일치하지 않습니다." };
		}
	} catch (error) {
		console.error("Error verifying project password: ", error);
		return { success: false, error };
	}
};

export const syncCommentCounts = async () => {
	try {
		const projectsQuery = query(collection(db, COLLECTION_NAME));
		// Use getDocs instead of getCountFromServer for list
		const projectsSnap = await import("firebase/firestore").then(mod => mod.getDocs(projectsQuery));

		let updated = 0;
		for (const docSnap of projectsSnap.docs) {
			const commentsRef = collection(db, COLLECTION_NAME, docSnap.id, "comments");
			const countSnap = await getCountFromServer(commentsRef);
			const count = countSnap.data().count;

			await updateDoc(doc(db, COLLECTION_NAME, docSnap.id), {
				commentCount: count
			});
			updated++;
		}
		return { success: true, count: updated };
	} catch (error) {
		console.error("Sync error:", error);
		return { success: false, error };
	}
};


// System Settings (Entry Password)
export const verifySystemPassword = async (inputPassword) => {
	try {
		const docRef = doc(db, "settings", "system");
		const docSnap = await getDoc(docRef);
		const inputHash = await hashPassword(inputPassword);

		if (!docSnap.exists()) {
			// Initialize with default password "1234" if not exists
			const defaultHash = await hashPassword("1234");
			await setDoc(docRef, { entryPassword: defaultHash });

			// If input matches "1234", success
			return inputPassword === "1234";
		}

		const storedHash = docSnap.data().entryPassword;
		return storedHash === inputHash;
	} catch (error) {
		console.error("System password check error:", error);
		// Fail open or closed? Closed for security.
		return false;
	}
};

// --- Deployments (Release Notes) ---

export const subscribeToDeployments = (projectId, callback, limitCount = 5) => {
	const q = query(
		collection(db, COLLECTION_NAME, projectId, "deployments"),
		orderBy("createdAt", "desc"),
		limit(limitCount)
	);

	return onSnapshot(q, (snapshot) => {
		const deployments = snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}));
		callback(deployments);
	});
};

export const addDeploymentLog = async (projectId, logData) => {
	try {
		await addDoc(collection(db, COLLECTION_NAME, projectId, "deployments"), {
			...logData,
			createdAt: serverTimestamp()
		});

		// Update latestVersion on the main project document
		if (logData.version) {
			await updateDoc(doc(db, COLLECTION_NAME, projectId), {
				latestVersion: logData.version
			});
		}

		return { success: true };
	} catch (error) {
		console.error("Error adding deployment log: ", error);
		return { success: false, error };
	}
};

export const updateDeploymentLog = async (projectId, logId, updateData) => {
	try {
		const logRef = doc(db, COLLECTION_NAME, projectId, "deployments", logId);
		await updateDoc(logRef, {
			...updateData,
			updatedAt: serverTimestamp()
		});

		// Check if this is the latest deployment (by checking the FIRST one in desc order)
		// A bit expensive to query again, but safe.
		// Actually, we can just check if the updated version is meant to be the "latest".
		// Better approach: Query the most recent one after update.
		const q = query(
			collection(db, COLLECTION_NAME, projectId, "deployments"),
			orderBy("createdAt", "desc"),
			limit(1)
		);

		// We need to wait a tiny bit or just fetch.
		const snapshot = await getDocs(q);
		if (!snapshot.empty) {
			const latestLog = snapshot.docs[0].data();
			// If the modified log is indeed the latest one (by date), update project latestVersion
			// Note: If we only edited content, version might be same. If we edited version, it changes.
			// We blindly update project.latestVersion to whatever the top log says now.
			await updateDoc(doc(db, COLLECTION_NAME, projectId), {
				latestVersion: latestLog.version
			});
		}

		return { success: true };
	} catch (error) {
		console.error("Error updating deployment log: ", error);
		return { success: false, error };
	}
};

export const deleteDeploymentLog = async (projectId, logId) => {
	try {
		await deleteDoc(doc(db, COLLECTION_NAME, projectId, "deployments", logId));
		return { success: true };
	} catch (error) {
		console.error("Error deleting deployment log: ", error);
		return { success: false, error };
	}
};


export const getDeploymentCount = async (projectId) => {
	try {
		const coll = collection(db, COLLECTION_NAME, projectId, "deployments");
		const snapshot = await getCountFromServer(coll);
		return snapshot.data().count;
	} catch (error) {
		console.error("Error getting deployment count:", error);
		return 0;
	}
};

// --- ELO Voting & Settings System ---

export const getVotingSettings = async () => {
	try {
		const docRef = doc(db, "settings", "voting");
		const docSnap = await getDoc(docRef);
		if (docSnap.exists()) {
			return docSnap.data();
		} else {
			const defaultSettings = {
				isActive: true,
				generation: 4,
				createdAt: serverTimestamp()
			};
			await setDoc(docRef, defaultSettings);
			return defaultSettings;
		}
	} catch (error) {
		console.error("Error getting voting settings:", error);
		return { isActive: false, generation: 4 };
	}
};

export const saveVotingSettings = async (settings) => {
	try {
		const docRef = doc(db, "settings", "voting");
		await setDoc(docRef, {
			...settings,
			updatedAt: serverTimestamp()
		}, { merge: true });
		return { success: true };
	} catch (error) {
		console.error("Error saving voting settings:", error);
		return { success: false, error };
	}
};

export const verifyStudentVoter = async (generation, course, name, birthdate) => {
	try {
		const q = query(
			collection(db, "students"),
			where("generation", "==", Number(generation)),
			where("course", "==", course),
			where("name", "==", name.trim()),
			where("birthdate", "==", birthdate.trim())
		);
		const snap = await getDocs(q);

		if (!snap.empty) {
			const docSnap = snap.docs[0];
			const studentData = docSnap.data();
			return {
				success: true,
				voter: {
					email: docSnap.id, 
					name: studentData.name,
					course: studentData.course,
					generation: studentData.generation,
					isAdmin: studentData.isAdmin || false
				}
			};
		} else {
			return { 
				success: false, 
				error: "등록된 학생 정보가 없거나 입력한 정보가 정확하지 않습니다. (과정, 이름, 생년월일 6자리를 확인해주세요)" 
			};
		}
	} catch (error) {
		console.error("Error verifying student voter:", error);
		return { success: false, error: "서버 오류가 발생했습니다. 다시 시도해주세요." };
	}
};

export const seedTestStudents = async () => {
	try {
		const studentRef = collection(db, "students");
		const countSnap = await getCountFromServer(studentRef);
		if (countSnap.data().count > 0) {
			return; // Already seeded
		}

		const testStudents = [
			// 3기
			{ id: "3_풀스택_홍길동_930125", generation: 3, course: "풀스택", name: "홍길동", birthdate: "930125", isAdmin: false },
			{ id: "3_풀스택_김철수_940212", generation: 3, course: "풀스택", name: "김철수", birthdate: "940212", isAdmin: false },
			{ id: "3_풀스택_이영희_950315", generation: 3, course: "풀스택", name: "이영희", birthdate: "950315", isAdmin: false },
			{ id: "3_인공지능_박민수_920420", generation: 3, course: "인공지능", name: "박민수", birthdate: "920420", isAdmin: false },
			{ id: "3_인공지능_최정우_910525", generation: 3, course: "인공지능", name: "최정우", birthdate: "910525", isAdmin: false },
			{ id: "3_클라우드_정다은_960630", generation: 3, course: "클라우드", name: "정다은", birthdate: "960630", isAdmin: false },
			{ id: "3_클라우드_강하늘_970714", generation: 3, course: "클라우드", name: "강하늘", birthdate: "970714", isAdmin: false },
			
			// 4기
			{ id: "4_풀스택_박지성_930225", generation: 4, course: "풀스택", name: "박지성", birthdate: "930225", isAdmin: false },
			{ id: "4_풀스택_손흥민_920708", generation: 4, course: "풀스택", name: "손흥민", birthdate: "920708", isAdmin: false },
			{ id: "4_인공지능_김연아_900905", generation: 4, course: "인공지능", name: "김연아", birthdate: "900905", isAdmin: false },
			{ id: "4_인공지능_류현진_870325", generation: 4, course: "인공지능", name: "류현진", birthdate: "870325", isAdmin: false },
			{ id: "4_클라우드_황희찬_960126", generation: 4, course: "클라우드", name: "황희찬", birthdate: "960126", isAdmin: false },
			{ id: "4_클라우드_이강인_010219", generation: 4, course: "클라우드", name: "이강인", birthdate: "010219", isAdmin: false },

			// 관리자 테스트용
			{ id: "admin_admin_admin_123456", generation: 4, course: "풀스택", name: "관리자", birthdate: "123456", isAdmin: true },
			{ id: "admin_admin_admin_123456_g3", generation: 3, course: "풀스택", name: "관리자", birthdate: "123456", isAdmin: true },
		];

		for (const student of testStudents) {
			await setDoc(doc(db, "students", student.id), student);
		}
		console.log("Successfully seeded test students!");
	} catch (e) {
		console.error("Error seeding students:", e);
	}
};

// Auto seed
seedTestStudents();

export const submitVote = async (voterEmail, projectA, projectB, winner, generation) => {
	try {
		const pairId = [projectA, projectB].sort().join("_");
		const voteId = `${voterEmail}_${pairId}`;

		const voteRef = doc(db, "votes", voteId);
		const studentRef = doc(db, "students", voterEmail);
		const matchRef = doc(db, "matchups", pairId);
		const projARef = doc(db, "projects", projectA);
		const projBRef = doc(db, "projects", projectB);

		await runTransaction(db, async (transaction) => {
			// 1. Read necessary docs
			const [voteSnap, studentSnap, matchSnap, projASnap, projBSnap] = await Promise.all([
				transaction.get(voteRef),
				transaction.get(studentRef),
				transaction.get(matchRef),
				transaction.get(projARef),
				transaction.get(projBRef)
			]);

			if (voteSnap.exists()) {
				// Already voted on this pair
				return;
			}

			// 2. Extract current values
			const currentAScore = projASnap.exists() ? (projASnap.data().elo || 1500) : 1500;
			const currentBScore = projBSnap.exists() ? (projBSnap.data().elo || 1500) : 1500;

			const currentAWins = projASnap.exists() ? (projASnap.data().wins || 0) : 0;
			const currentALosses = projASnap.exists() ? (projASnap.data().losses || 0) : 0;
			const currentAMatches = projASnap.exists() ? (projASnap.data().totalMatches || 0) : 0;

			const currentBWins = projBSnap.exists() ? (projBSnap.data().wins || 0) : 0;
			const currentBLosses = projBSnap.exists() ? (projBSnap.data().losses || 0) : 0;
			const currentBMatches = projBSnap.exists() ? (projBSnap.data().totalMatches || 0) : 0;

			// 3. ELO rating change calculation
			const K_FACTOR = 32;
			const eA = 1 / (1 + Math.pow(10, (currentBScore - currentAScore) / 400));
			const eB = 1 / (1 + Math.pow(10, (currentAScore - currentBScore) / 400));

			const sA = winner === projectA ? 1 : 0;
			const sB = winner === projectB ? 1 : 0;

			const newAScore = Math.round(currentAScore + K_FACTOR * (sA - eA));
			const newBScore = Math.round(currentBScore + K_FACTOR * (sB - eB));

			// 4. Update Matchup
			let matchData = {
				projectA,
				projectB,
				generation,
				winsA: 0,
				winsB: 0,
				total: 0
			};
			if (matchSnap.exists()) {
				matchData = { ...matchData, ...matchSnap.data() };
			}
			matchData.total++;
			if (winner === projectA) {
				matchData.winsA++;
			} else {
				matchData.winsB++;
			}

			// 5. Commit updates
			transaction.set(voteRef, {
				voterEmail,
				projectA,
				projectB,
				winner,
				generation,
				timestamp: serverTimestamp()
			});

			const currentVoteCount = studentSnap.exists() ? (studentSnap.data().voteCount || 0) : 0;
			transaction.update(studentRef, {
				voteCount: currentVoteCount + 1
			});

			transaction.set(matchRef, matchData);

			transaction.update(projARef, {
				elo: newAScore,
				wins: currentAWins + (winner === projectA ? 1 : 0),
				losses: currentALosses + (winner === projectB ? 1 : 0),
				totalMatches: currentAMatches + 1
			});

			transaction.update(projBRef, {
				elo: newBScore,
				wins: currentBWins + (winner === projectB ? 1 : 0),
				losses: currentBLosses + (winner === projectA ? 1 : 0),
				totalMatches: currentBMatches + 1
			});
		});

		return { success: true };
	} catch (error) {
		console.error("Transaction failed: ", error);
		return { success: false, error };
	}
};

export const getVoterVotes = async (voterEmail) => {
	try {
		const q = query(
			collection(db, "votes"),
			where("voterEmail", "==", voterEmail)
		);
		const snap = await getDocs(q);
		return snap.docs.map(doc => doc.data());
	} catch (error) {
		console.error("Error getting voter votes: ", error);
		return [];
	}
};

export const getVotesByGeneration = async (generation) => {
	try {
		const q = query(
			collection(db, "votes"),
			where("generation", "==", generation)
		);
		const snap = await getDocs(q);
		return snap.docs.map(doc => doc.data());
	} catch (error) {
		console.error("Error getting votes by generation: ", error);
		return [];
	}
};

export const getGenerations = async () => {
	try {
		const coll = collection(db, "generations");
		const snap = await getDocs(coll);
		if (snap.empty) {
			const defaults = [
				{ id: "gen_1", value: 1, name: "1기", order: 1 },
				{ id: "gen_2", value: 2, name: "2기", order: 2 },
				{ id: "gen_3", value: 3, name: "3기", order: 3 },
				{ id: "gen_4", value: 4, name: "4기", order: 4 },
			];
			for (const gen of defaults) {
				await setDoc(doc(db, "generations", gen.id), gen);
			}
			return defaults.sort((a, b) => a.order - b.order);
		}
		return snap.docs.map(doc => {
			const data = doc.data();
			return {
				id: doc.id,
				...data,
				order: data.order !== undefined ? Number(data.order) : 999
			};
		}).sort((a, b) => a.order - b.order);
	} catch (error) {
		console.error("Error getting generations:", error);
		return [
			{ id: "gen_1", value: 1, name: "1기", order: 1 },
			{ id: "gen_2", value: 2, name: "2기", order: 2 },
			{ id: "gen_3", value: 3, name: "3기", order: 3 },
			{ id: "gen_4", value: 4, name: "4기", order: 4 },
		];
	}
};

// --- Admin Management Functions ---

export const updateGeneration = async (genId, data) => {
	try {
		const genRef = doc(db, "generations", genId);
		await setDoc(genRef, data, { merge: true });
		return { success: true };
	} catch (error) {
		console.error("Error updating generation:", error);
		return { success: false, error };
	}
};

export const deleteGeneration = async (genId) => {
	try {
		const genRef = doc(db, "generations", genId);
		await deleteDoc(genRef);
		return { success: true };
	} catch (error) {
		console.error("Error deleting generation:", error);
		return { success: false, error };
	}
};

export const updateSystemPassword = async (currentPassword, newPassword) => {
	try {
		const isValid = await verifySystemPassword(currentPassword);
		if (!isValid) {
			return { success: false, error: "현재 비밀번호가 일치하지 않습니다." };
		}
		const newHash = await hashPassword(newPassword);
		const docRef = doc(db, "settings", "system");
		await setDoc(docRef, { entryPassword: newHash }, { merge: true });
		return { success: true };
	} catch (error) {
		console.error("Error updating system password:", error);
		return { success: false, error: "비밀번호 변경 중 오류가 발생했습니다." };
	}
};

// System Settings (Admin Master Password)
export const verifyAdminPassword = async (inputPassword) => {
	try {
		const docRef = doc(db, "settings", "system");
		const docSnap = await getDoc(docRef);
		const inputHash = await hashPassword(inputPassword);

		if (!docSnap.exists()) {
			// Initialize with default admin password "1234" if not exists
			const defaultHash = await hashPassword("1234");
			await setDoc(docRef, { adminPassword: defaultHash }, { merge: true });
			return inputPassword === "1234";
		}

		const data = docSnap.data();
		// If adminPassword does not exist yet (migration phase), set as default "1234"
		if (!data.adminPassword) {
			const defaultHash = await hashPassword("1234");
			await setDoc(docRef, { adminPassword: defaultHash }, { merge: true });
			return inputPassword === "1234";
		}

		return data.adminPassword === inputHash;
	} catch (error) {
		console.error("Admin password check error:", error);
		return false;
	}
};

export const updateAdminPassword = async (currentPassword, newPassword) => {
	try {
		const isValid = await verifyAdminPassword(currentPassword);
		if (!isValid) {
			return { success: false, error: "현재 비밀번호가 일치하지 않습니다." };
		}
		const newHash = await hashPassword(newPassword);
		const docRef = doc(db, "settings", "system");
		await setDoc(docRef, { adminPassword: newHash }, { merge: true });
		return { success: true };
	} catch (error) {
		console.error("Error updating admin password:", error);
		return { success: false, error: "비밀번호 변경 중 오류가 발생했습니다." };
	}
};

export const adminDeleteProject = async (projectId) => {
	try {
		await deleteDoc(doc(db, "projects", projectId));
		try {
			await deleteDoc(doc(db, PROJECT_SECRETS_COLLECTION, projectId));
		} catch (e) {
			// secret 문서가 없어도 무시
		}
		return { success: true };
	} catch (error) {
		console.error("Error deleting project:", error);
		return { success: false, error };
	}
};

export const adminUpdateProjectPassword = async (projectId, newPassword) => {
	try {
		const hashedPw = await hashPassword(newPassword);
		await setDoc(doc(db, PROJECT_SECRETS_COLLECTION, projectId), { password: hashedPw }, { merge: true });
		return { success: true };
	} catch (error) {
		console.error("Error updating project password:", error);
		return { success: false, error };
	}
};

export const getStudentsByGeneration = async (generation) => {
	try {
		const q = query(
			collection(db, "students"),
			where("generation", "==", Number(generation))
		);
		const snap = await getDocs(q);
		return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
	} catch (error) {
		console.error("Error getting students by generation:", error);
		return [];
	}
};



export const getMatchupsByGeneration = async (generation) => {
	try {
		const q = query(
			collection(db, "matchups"),
			where("generation", "==", Number(generation))
		);
		const snap = await getDocs(q);
		return snap.docs.map(doc => doc.data());
	} catch (error) {
		console.error("Error getting matchups:", error);
		return [];
	}
};

export const syncVotingData = async (generation) => {
	try {
		// 1. Get all votes for the generation
		const votesRef = collection(db, "votes");
		const votesQuery = query(votesRef, where("generation", "==", Number(generation)));
		const votesSnap = await getDocs(votesQuery);
		const allVotes = votesSnap.docs.map(doc => doc.data());

		// Sort chronologically to recompute ELO ratings correctly
		allVotes.sort((a, b) => {
			const tA = a.timestamp?.seconds || 0;
			const tB = b.timestamp?.seconds || 0;
			return tA - tB;
		});

		// 2. Fetch all projects for the generation
		const projectsRef = collection(db, "projects");
		const projectsQuery = query(projectsRef, where("generation", "==", Number(generation)));
		const projectsSnap = await getDocs(projectsQuery);
		const projectsList = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

		// 3. Fetch all students for the generation
		const studentsRef = collection(db, "students");
		const studentsQuery = query(studentsRef, where("generation", "==", Number(generation)));
		const studentsSnap = await getDocs(studentsQuery);
		const studentsList = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

		// 4. Initialize stats mapping
		const projectStats = {};
		projectsList.forEach(p => {
			projectStats[p.id] = { elo: 1500, wins: 0, losses: 0, totalMatches: 0 };
		});

		const studentStats = {};
		studentsList.forEach(s => {
			studentStats[s.id] = { voteCount: 0 };
		});

		const matchupStats = {};

		// 5. Recompute values
		allVotes.forEach(vote => {
			const { projectA, projectB, winner, voterEmail } = vote;

			if (!projectStats[projectA]) projectStats[projectA] = { elo: 1500, wins: 0, losses: 0, totalMatches: 0 };
			if (!projectStats[projectB]) projectStats[projectB] = { elo: 1500, wins: 0, losses: 0, totalMatches: 0 };

			if (voterEmail) {
				if (!studentStats[voterEmail]) studentStats[voterEmail] = { voteCount: 0 };
				studentStats[voterEmail].voteCount++;
			}

			const K_FACTOR = 32;
			const rA = projectStats[projectA].elo;
			const rB = projectStats[projectB].elo;

			const eA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
			const eB = 1 / (1 + Math.pow(10, (rA - rB) / 400));

			const sA = winner === projectA ? 1 : 0;
			const sB = winner === projectB ? 1 : 0;

			projectStats[projectA].elo = Math.round(rA + K_FACTOR * (sA - eA));
			projectStats[projectB].elo = Math.round(rB + K_FACTOR * (sB - eB));

			projectStats[projectA].totalMatches++;
			projectStats[projectB].totalMatches++;
			if (winner === projectA) {
				projectStats[projectA].wins++;
				projectStats[projectB].losses++;
			} else {
				projectStats[projectB].wins++;
				projectStats[projectA].losses++;
			}

			const pairId = [projectA, projectB].sort().join("_");
			if (!matchupStats[pairId]) {
				matchupStats[pairId] = {
					projectA,
					projectB,
					generation,
					winsA: 0,
					winsB: 0,
					total: 0
				};
			}
			matchupStats[pairId].total++;
			if (winner === projectA) {
				matchupStats[pairId].winsA++;
			} else {
				matchupStats[pairId].winsB++;
			}
		});

		// 6. Write aggregates to Firestore using Batch
		const batch = writeBatch(db);

		projectsList.forEach(p => {
			const stats = projectStats[p.id];
			if (stats) {
				const ref = doc(db, "projects", p.id);
				batch.update(ref, stats);
			}
		});

		studentsList.forEach(s => {
			const stats = studentStats[s.id];
			const count = stats ? stats.voteCount : 0;
			const ref = doc(db, "students", s.id);
			batch.update(ref, { voteCount: count });
		});

		Object.entries(matchupStats).forEach(([pairId, data]) => {
			const ref = doc(db, "matchups", pairId);
			batch.set(ref, data);
		});

		await batch.commit();
		return { success: true, voteCount: allVotes.length };
	} catch (error) {
		console.error("Sync voting data error:", error);
		return { success: false, error };
	}
};
