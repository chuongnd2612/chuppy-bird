/** The ADO field reference names we read, in one place. */
export const FIELD = {
  id: 'System.Id',
  title: 'System.Title',
  workItemType: 'System.WorkItemType',
  state: 'System.State',
  reason: 'System.Reason',
  areaPath: 'System.AreaPath',
  iterationPath: 'System.IterationPath',
  assignedTo: 'System.AssignedTo',
  createdBy: 'System.CreatedBy',
  createdDate: 'System.CreatedDate',
  changedDate: 'System.ChangedDate',
  tags: 'System.Tags',
  description: 'System.Description',
  reproSteps: 'Microsoft.VSTS.TCM.ReproSteps',
  acceptanceCriteria: 'Microsoft.VSTS.Common.AcceptanceCriteria',
  priority: 'Microsoft.VSTS.Common.Priority',
  storyPoints: 'Microsoft.VSTS.Scheduling.StoryPoints',
  effort: 'Microsoft.VSTS.Scheduling.Effort',
  boardColumn: 'System.BoardColumn',
} as const;

/** The subset a board card needs — keeps the batch response small over mobile data. */
export const CARD_FIELDS: string[] = [
  FIELD.id,
  FIELD.title,
  FIELD.workItemType,
  FIELD.state,
  FIELD.assignedTo,
  FIELD.tags,
  FIELD.priority,
  FIELD.changedDate,
  FIELD.boardColumn,
];
