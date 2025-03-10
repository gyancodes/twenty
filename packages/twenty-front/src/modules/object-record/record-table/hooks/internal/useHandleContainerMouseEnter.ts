import { useRecoilCallback } from 'recoil';

import { useMoveSoftFocusToCurrentCellOnHover } from '@/object-record/record-table/record-table-cell/hooks/useMoveSoftFocusToCurrentCellOnHover';
import { currentTableCellInEditModePositionComponentState } from '@/object-record/record-table/states/currentTableCellInEditModePositionComponentState';
import { isSoftFocusOnTableCellComponentFamilyState } from '@/object-record/record-table/states/isSoftFocusOnTableCellComponentFamilyState';
import { isSoftFocusUsingMouseState } from '@/object-record/record-table/states/isSoftFocusUsingMouseState';
import { isTableCellInEditModeComponentFamilyState } from '@/object-record/record-table/states/isTableCellInEditModeComponentFamilyState';
import { TableCellPosition } from '@/object-record/record-table/types/TableCellPosition';
import { getSnapshotValue } from '@/ui/utilities/recoil-scope/utils/getSnapshotValue';
import { useRecoilComponentCallbackStateV2 } from '@/ui/utilities/state/component-state/hooks/useRecoilComponentCallbackStateV2';

export type HandleContainerMouseEnterArgs = {
  cellPosition: TableCellPosition;
};

export const useHandleContainerMouseEnter = ({
  recordTableId,
}: {
  recordTableId: string;
}) => {
  const { moveSoftFocusToCurrentCell } =
    useMoveSoftFocusToCurrentCellOnHover(recordTableId);

  const currentTableCellInEditModePositionState =
    useRecoilComponentCallbackStateV2(
      currentTableCellInEditModePositionComponentState,
      recordTableId,
    );

  const isSoftFocusOnTableCellFamilyState = useRecoilComponentCallbackStateV2(
    isSoftFocusOnTableCellComponentFamilyState,
    recordTableId,
  );

  const isTableCellInEditModeFamilyState = useRecoilComponentCallbackStateV2(
    isTableCellInEditModeComponentFamilyState,
    recordTableId,
  );

  const handleContainerMouseEnter = useRecoilCallback(
    ({ snapshot, set }) =>
      ({ cellPosition }: HandleContainerMouseEnterArgs) => {
        const isSoftFocusOnTableCell = getSnapshotValue(
          snapshot,
          isSoftFocusOnTableCellFamilyState(cellPosition),
        );

        const currentTableCellInEditModePosition = getSnapshotValue(
          snapshot,
          currentTableCellInEditModePositionState,
        );

        const isSomeCellInEditMode = getSnapshotValue(
          snapshot,
          isTableCellInEditModeFamilyState(currentTableCellInEditModePosition),
        );

        if (!isSomeCellInEditMode && !isSoftFocusOnTableCell) {
          moveSoftFocusToCurrentCell(cellPosition);
          set(isSoftFocusUsingMouseState, true);
        }
      },
    [
      isSoftFocusOnTableCellFamilyState,
      currentTableCellInEditModePositionState,
      isTableCellInEditModeFamilyState,
      moveSoftFocusToCurrentCell,
    ],
  );

  return {
    handleContainerMouseEnter,
  };
};
