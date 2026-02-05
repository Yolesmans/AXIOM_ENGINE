/**
 * Script de vérification PHASE 1 - Persistance QuestionQueue et AnswerMap
 * 
 * Ce script valide que :
 * - setQuestionsForBlock initialise correctement cursorIndex=0
 * - advanceQuestionCursor incrémente cursorIndex
 * - La persistance fonctionne (rechargement via store.get)
 * - storeAnswerForBlock stocke les réponses correctement
 */

import { candidateStore } from '../src/store/sessionStore.js';
import { v4 as uuidv4 } from 'uuid';

async function verifyPhase1() {
  console.log('🔍 Vérification PHASE 1 - Persistance QuestionQueue et AnswerMap\n');

  const candidateId = uuidv4();
  const tenantId = 'test-tenant';

  try {
    // 1. Créer un candidat via le store
    console.log('1️⃣ Création candidat...');
    const candidate = candidateStore.create(candidateId, tenantId);
    console.log('✅ Candidat créé:', candidate.candidateId);
    console.log('   blockQueues:', candidate.blockQueues);
    console.log('   answerMaps:', candidate.answerMaps);

    // 2. setQuestionsForBlock(id, 1, ["Q1","Q2","Q3"])
    console.log('\n2️⃣ setQuestionsForBlock(id, 1, ["Q1","Q2","Q3"])...');
    const queue = candidateStore.setQuestionsForBlock(candidateId, 1, ['Q1', 'Q2', 'Q3']);
    console.log('✅ Queue créée:', {
      blockNumber: queue.blockNumber,
      questions: queue.questions,
      cursorIndex: queue.cursorIndex,
      isComplete: queue.isComplete,
    });

    // 3. Vérifier cursorIndex===0
    console.log('\n3️⃣ Vérification cursorIndex===0...');
    if (queue.cursorIndex !== 0) {
      throw new Error(`❌ cursorIndex attendu: 0, obtenu: ${queue.cursorIndex}`);
    }
    console.log('✅ cursorIndex === 0');

    // 4. advanceQuestionCursor(id,1) => cursorIndex===1
    console.log('\n4️⃣ advanceQuestionCursor(id, 1)...');
    const advancedQueue = candidateStore.advanceQuestionCursor(candidateId, 1);
    if (!advancedQueue) {
      throw new Error('❌ advanceQuestionCursor a retourné undefined');
    }
    console.log('✅ Queue avancée:', {
      cursorIndex: advancedQueue.cursorIndex,
    });

    if (advancedQueue.cursorIndex !== 1) {
      throw new Error(`❌ cursorIndex attendu: 1, obtenu: ${advancedQueue.cursorIndex}`);
    }
    console.log('✅ cursorIndex === 1');

    // 5. Recharger le candidat via store.get(id)
    console.log('\n5️⃣ Rechargement candidat via store.get(id)...');
    const reloadedCandidate = candidateStore.get(candidateId);
    if (!reloadedCandidate) {
      throw new Error('❌ Candidat non trouvé après rechargement');
    }
    console.log('✅ Candidat rechargé');

    // 6. Vérifier que blockQueues[1].cursorIndex===1
    console.log('\n6️⃣ Vérification blockQueues[1].cursorIndex===1...');
    const reloadedQueue = reloadedCandidate.blockQueues?.[1];
    if (!reloadedQueue) {
      throw new Error('❌ blockQueues[1] non trouvé après rechargement');
    }
    console.log('✅ blockQueues[1] trouvé:', {
      cursorIndex: reloadedQueue.cursorIndex,
      questions: reloadedQueue.questions,
    });

    if (reloadedQueue.cursorIndex !== 1) {
      throw new Error(
        `❌ cursorIndex attendu après rechargement: 1, obtenu: ${reloadedQueue.cursorIndex}`
      );
    }
    console.log('✅ cursorIndex === 1 après rechargement (persistance OK)');

    // 7. storeAnswerForBlock(id,1,0,"A1")
    console.log('\n7️⃣ storeAnswerForBlock(id, 1, 0, "A1")...');
    const answerMap = candidateStore.storeAnswerForBlock(candidateId, 1, 0, 'A1');
    console.log('✅ Réponse stockée:', {
      blockNumber: answerMap.blockNumber,
      answers: answerMap.answers,
      lastAnswerAt: answerMap.lastAnswerAt,
    });

    // 8. Recharger et vérifier answerMaps[1].answers[0]==="A1"
    console.log('\n8️⃣ Rechargement et vérification answerMaps[1].answers[0]==="A1"...');
    const finalCandidate = candidateStore.get(candidateId);
    if (!finalCandidate) {
      throw new Error('❌ Candidat non trouvé après stockage réponse');
    }

    const finalAnswerMap = finalCandidate.answerMaps?.[1];
    if (!finalAnswerMap) {
      throw new Error('❌ answerMaps[1] non trouvé après rechargement');
    }
    console.log('✅ answerMaps[1] trouvé:', {
      answers: finalAnswerMap.answers,
    });

    if (finalAnswerMap.answers[0] !== 'A1') {
      throw new Error(
        `❌ answers[0] attendu: "A1", obtenu: "${finalAnswerMap.answers[0]}"`
      );
    }
    console.log('✅ answerMaps[1].answers[0] === "A1" (persistance OK)');

    console.log('\n🎉 Tous les tests PHASE 1 sont passés !');
    console.log('\nRésumé:');
    console.log('  ✅ setQuestionsForBlock initialise cursorIndex=0');
    console.log('  ✅ advanceQuestionCursor incrémente cursorIndex');
    console.log('  ✅ Persistance blockQueues fonctionne');
    console.log('  ✅ storeAnswerForBlock stocke les réponses');
    console.log('  ✅ Persistance answerMaps fonctionne');
  } catch (error) {
    console.error('\n❌ ERREUR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

verifyPhase1();
