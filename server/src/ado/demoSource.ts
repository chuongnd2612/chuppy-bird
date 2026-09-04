import type {
  AdoBoard,
  AdoBoardRef,
  AdoComment,
  AdoProject,
  AdoTeam,
  AdoWorkItem,
} from '../../../shared/types.ts';
import {
  demoBoard,
  demoBoardRefs,
  demoComments,
  demoProjects,
  demoTeams,
  makeWorkItem,
} from '../../../shared/fixtures.ts';
import { AdoError } from './errors.ts';
import type { BoardOptions, TicketSource } from './service.ts';

/**
 * Fixture-backed source for DEMO_MODE, so the UI can be run and reviewed
 * without a PAT, a VPN, or a real organization.
 */
export class DemoSource implements TicketSource {
  async listProjects(): Promise<AdoProject[]> {
    return demoProjects;
  }

  async listTeams(): Promise<AdoTeam[]> {
    return demoTeams;
  }

  async listBoards(): Promise<AdoBoardRef[]> {
    return demoBoardRefs;
  }

  async getBoard(_project: string, _team: string, _boardId: string, options: BoardOptions = {}): Promise<AdoBoard> {
    if (options.includeClosed) return demoBoard;
    return { ...demoBoard, cards: demoBoard.cards.filter((card) => card.state !== 'Closed') };
  }

  async getWorkItem(_project: string, id: number): Promise<AdoWorkItem> {
    const card = demoBoard.cards.find((candidate) => candidate.id === id);
    if (!card) throw new AdoError(`Work item ${id} is not in the demo data`, 404);
    return makeWorkItem({
      id: card.id,
      title: card.title,
      workItemType: card.workItemType,
      state: card.state,
      assignedTo: card.assignedTo,
      tags: card.tags,
      priority: card.priority,
      ...(card.id === 1043
        ? { descriptionHtml: null, reproStepsHtml: null, acceptanceCriteriaHtml: null, attachments: [] }
        : {}),
    });
  }

  async listComments(_project: string, id: number): Promise<AdoComment[]> {
    return id === 1042 ? demoComments : [];
  }

  invalidate(): void {
    // Fixtures never go stale.
  }
}
