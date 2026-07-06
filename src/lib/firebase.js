import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
	arrayRemove
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
		// Pair ID (independent of presentation order)
		const pairId = [projectA, projectB].sort().join("_");
		const voteId = `${voterEmail}_${pairId}`;

		const voteRef = doc(db, "votes", voteId);
		await setDoc(voteRef, {
			voterEmail,
			projectA,
			projectB,
			winner,
			generation,
			timestamp: serverTimestamp()
		});
		return { success: true };
	} catch (error) {
		console.error("Error submitting vote: ", error);
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
		return snap.docs.map(doc => doc.data()).sort((a, b) => a.order - b.order);
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

