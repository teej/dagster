import {
  Box,
  Button,
  Colors,
  FontFamily,
  Icon,
  SplitPanelContainer,
  Subheading,
  Table,
} from '@dagster-io/ui';
import flatMap from 'lodash/flatMap';
import uniqBy from 'lodash/uniqBy';
import * as React from 'react';
import {Link} from 'react-router-dom';

import {
  displayNameForAssetKey,
  GraphData,
  identifyBundles,
  tokenForAssetKey,
} from '../asset-graph/Utils';
import {useViewport} from '../gantt/useViewport';
import {instanceAssetsExplorerPathToURL} from '../pipelines/PipelinePathUtils';

import styled from 'styled-components/macro';
import {
  AssetLatestRunWithNotices,
  AssetNode,
  AssetNodeBox,
  AssetRunLink,
} from '../asset-graph/AssetNode';
import {useLiveDataForAssetKeys} from '../asset-graph/useLiveDataForAssetKeys';
import {SidebarAssetInfo} from '../asset-graph/SidebarAssetInfo';
import {RightInfoPanel, RightInfoPanelContent} from '../pipelines/GraphExplorer';
import {AssetKey} from './types';
import {TimestampDisplay} from '../schedules/TimestampDisplay';

const PADDING = 30;

interface Box {
  id: string;
  contentIds: string[];
  layout: {top: number; left: number; width: number; height: number};
}

function keyForAssetId(id: string) {
  return {path: JSON.parse(id)};
}

function processGraphData(assetGraphData: GraphData | null) {
  if (!assetGraphData) {
    return {bundles: {}, bundleForAssetId: {}, unbundledAssetIds: [], renderedEdges: []};
  }

  const assetIds = Object.keys(assetGraphData.nodes);
  const bundles = identifyBundles(assetIds);
  const bundleForAssetId: {[assetId: string]: string} = {};
  for (const [bundleId, childrenIds] of Object.entries(bundles)) {
    childrenIds.forEach((c) => (bundleForAssetId[c] = bundleId));
  }

  const unbundledAssetIds = assetIds.filter((id) => !bundleForAssetId[id]);

  const edges = flatMap(Object.entries(assetGraphData.downstream), ([from, downstreams]) =>
    Object.keys(downstreams).map((to) => ({from, to})),
  );
  const renderedIds = [...Object.keys(bundleForAssetId), ...unbundledAssetIds];
  const renderedEdges = uniqBy(
    edges.map((e) => ({
      from: renderedIds[e.from] ? e.from : bundleForAssetId[e.from] || e.from,
      to: renderedIds[e.to] ? e.to : bundleForAssetId[e.to] || e.to,
    })),
    JSON.stringify,
  );

  return {bundles, bundleForAssetId, unbundledAssetIds, renderedEdges};
}

export const AssetGrid: React.FC<{
  assetGraphData: GraphData | null;
}> = ({assetGraphData}) => {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  const {containerProps, viewport} = useViewport();

  const {bundles, unbundledAssetIds, renderedEdges} = processGraphData(assetGraphData);
  const itemsPerRow = Math.round(((window.innerWidth - 40) * 0.7) / 260);
  const itemWidth = (viewport.width - 40 - (itemsPerRow - 1) * PADDING) / itemsPerRow;

  const {liveDataByNode} = useLiveDataForAssetKeys(
    null,
    assetGraphData,
    unbundledAssetIds.map(keyForAssetId),
  );

  const edgeFocused = highlighted || selected;
  const hasHighlightedEdgeIn = new Set<string>();
  const hasHighlightedEdgeOut = new Set<string>();
  if (edgeFocused) {
    for (const e of renderedEdges) {
      if ((e.from === edgeFocused || e.to === edgeFocused) && e.from !== e.to) {
        hasHighlightedEdgeIn.add(e.to);
        hasHighlightedEdgeOut.add(e.from);
      }
    }
  }

  const renderGridItem = (id: string, children: React.ReactNode) => (
    <FolderContainer
      key={id}
      $selected={selected === id}
      $faded={
        !!edgeFocused &&
        id !== highlighted &&
        id !== selected &&
        !hasHighlightedEdgeIn.has(id) &&
        !hasHighlightedEdgeOut.has(id)
      }
      style={{width: itemWidth}}
      onMouseEnter={() => setHighlighted(id)}
      onMouseLeave={() => setHighlighted(null)}
      onClick={(e) => {
        e.stopPropagation();
        setSelected(id);
      }}
    >
      {hasHighlightedEdgeIn.has(id) && <div className="edge edge-in" />}
      {hasHighlightedEdgeOut.has(id) && <div className="edge edge-out" />}
      {children}
    </FolderContainer>
  );

  return (
    <SplitPanelContainer
      identifier="explorer"
      firstInitialPercent={70}
      firstMinSize={400}
      first={
        <div
          {...containerProps}
          style={{overflowY: 'scroll', position: 'relative', width: '100%'}}
          onClick={() => setSelected(null)}
        >
          <Box
            flex={{justifyContent: 'space-between', alignItems: 'center'}}
            padding={{vertical: 16, horizontal: 24}}
            border={{side: 'bottom', color: Colors.KeylineGray, width: 1}}
            style={{marginBottom: -1}}
          >
            <Subheading>{Object.keys(bundles).length} Asset Groups</Subheading>
          </Box>
          <Box flex={{wrap: 'wrap', gap: 20}} padding={20}>
            {Object.keys(bundles)
              .sort()
              .map((bundleId) =>
                renderGridItem(bundleId, <Folder id={bundleId} contentIds={bundles[bundleId]} />),
              )}
          </Box>

          <Box
            flex={{justifyContent: 'space-between', alignItems: 'center'}}
            padding={{vertical: 16, horizontal: 24}}
            border={{side: 'horizontal', color: Colors.KeylineGray, width: 1}}
            style={{marginBottom: -1}}
          >
            <Subheading>{unbundledAssetIds.length} Ungrouped Assets</Subheading>
          </Box>

          <Box flex={{wrap: 'wrap', gap: 20}} padding={20}>
            {assetGraphData ? (
              unbundledAssetIds
                .sort()
                .map((assetId) =>
                  renderGridItem(
                    assetId,
                    <AssetNode
                      width={itemWidth}
                      definition={assetGraphData.nodes[assetId].definition}
                      liveData={liveDataByNode[assetId]}
                      selected={selected === assetId}
                      padded={false}
                    />,
                  ),
                )
            ) : (
              <span />
            )}
          </Box>
        </div>
      }
      second={
        selected && assetGraphData ? (
          <RightInfoPanel>
            <RightInfoPanelContent>
              {assetGraphData?.nodes[selected] ? (
                <SidebarAssetInfo
                  assetKey={keyForAssetId(selected)}
                  liveData={liveDataByNode[selected]}
                />
              ) : (
                <SidebarAssetBundleInfo
                  bundleKey={keyForAssetId(selected)}
                  assetGraphData={assetGraphData}
                  assetIds={bundles[selected]}
                />
              )}
            </RightInfoPanelContent>
          </RightInfoPanel>
        ) : undefined
      }
    />
  );
};

const Folder: React.FC<{id: string; contentIds: string[]}> = ({id, contentIds}) => (
  <FolderBox>
    <Box flex={{gap: 8}} padding={{horizontal: 8, vertical: 4}}>
      <Icon name="folder" size={16} />
      <div style={{fontFamily: FontFamily.monospace, fontWeight: 600}}>
        {displayNameForAssetKey(keyForAssetId(id))}
      </div>
    </Box>
    <Box
      flex={{gap: 8, justifyContent: 'space-between'}}
      padding={{horizontal: 8, vertical: 4}}
      background={Colors.Gray100}
      style={{userSelect: 'none'}}
    >
      <div> {contentIds.length} items</div>
      <Link
        to={instanceAssetsExplorerPathToURL({
          opsQuery: `${tokenForAssetKey(keyForAssetId(id))}/`,
          opNames: [],
        })}
      >
        <Box flex={{gap: 4}}>
          <Icon name="schema" size={16} color={Colors.Link} />
          View Graph
        </Box>
      </Link>
    </Box>
  </FolderBox>
);

const FolderContainer = styled.div<{$selected: boolean; $faded?: boolean}>`
  border-radius: 6px;
  outline-offset: -1px;
  position: relative;
  inset: 0;

  margin: 0;
  transition: opacity 150ms linear;
  opacity: ${(p) => (p.$faded ? 0.4 : 1)};

  .edge {
    position: absolute;
    left: 50%;
    width: 12px;
    height: 12px;
    border: 12px solid transparent;
  }
  .edge.edge-in {
    top: 0px;
    transform: translate(-50%, -100%);
    border-bottom: 9px solid ${Colors.Gray300};
  }
  .edge.edge-out {
    bottom: 0px;
    transform: translate(-50%, 100%);
    border-top: 9px solid ${Colors.Gray300};
  }

  ${AssetNodeBox} {
    min-height: 108px;
  }

  ${(p) =>
    p.$selected &&
    `
    ${FolderBox} {
      border: 2px solid ${Colors.Blue500};
    }
    .edge.edge-in {
      border-bottom: 9px solid ${Colors.Blue500};
    }
    .edge.edge-out {
      border-top: 9px solid ${Colors.Blue500};
    }
  `}
`;

const FolderBox = styled.div`
  border: 2px solid ${Colors.Gray300};
  background: ${Colors.White};
  border-radius: 5px;
  position: relative;
  &:hover {
    box-shadow: rgba(0, 0, 0, 0.12) 0px 2px 12px 0px;
  }
`;

const SidebarAssetBundleInfo: React.FC<{
  bundleKey: AssetKey;
  assetGraphData: GraphData;
  assetIds: string[];
}> = ({assetIds, assetGraphData, bundleKey}) => {
  const baseDisplayName = displayNameForAssetKey({path: [...bundleKey.path, '']});
  const {liveDataByNode} = useLiveDataForAssetKeys(
    null,
    assetGraphData,
    assetIds.map((id) => ({path: JSON.parse(id)})),
  );
  return (
    <div>
      <Box
        flex={{justifyContent: 'space-between', alignItems: 'center'}}
        padding={{vertical: 12, left: 24, right: 12}}
        border={{side: 'bottom', color: Colors.KeylineGray, width: 1}}
        style={{marginBottom: -1}}
      >
        <Subheading>
          <Box flex={{gap: 8, alignItems: 'center'}}>
            <Icon size={16} name="folder" />
            {displayNameForAssetKey(bundleKey)}
          </Box>
        </Subheading>
        <Link
          to={instanceAssetsExplorerPathToURL({
            opsQuery: `${tokenForAssetKey(bundleKey)}/`,
            opNames: [],
          })}
        >
          <Button icon={<Icon name="schema" size={16} />}>View Graph</Button>
        </Link>
      </Box>
      <Table style={{minWidth: 0, maxWidth: '100%'}}>
        <thead>
          <tr>
            <th>Asset Key</th>
            <th style={{width: 100}}>Materialized</th>
            <th style={{width: 100}}>Latest Run</th>
          </tr>
        </thead>
        <tbody>
          {assetIds.map((id) => {
            const stepKey = assetGraphData.nodes[id].definition.opName;
            const lastMaterialization = liveDataByNode[id]?.lastMaterialization;

            return (
              <tr key={id}>
                <td style={{width: '100%', minWidth: 0, overflow: 'hidden'}}>
                  <div>
                    <Link to={`/instance/assets/${keyForAssetId(id).path.join('/')}`}>
                      <Box flex={{gap: 8, alignItems: 'center'}}>
                        <Icon name="asset" size={16} />
                        {displayNameForAssetKey(keyForAssetId(id)).replace(baseDisplayName, './ ')}
                      </Box>
                    </Link>
                  </div>
                </td>
                <td>
                  {lastMaterialization ? (
                    <AssetRunLink
                      runId={lastMaterialization.runId}
                      event={{stepKey, timestamp: lastMaterialization.timestamp}}
                    >
                      <TimestampDisplay
                        timestamp={Number(lastMaterialization.timestamp) / 1000}
                        timeFormat={{showSeconds: false, showTimezone: false}}
                      />
                    </AssetRunLink>
                  ) : (
                    '–'
                  )}
                </td>
                <td>
                  <AssetLatestRunWithNotices liveData={liveDataByNode[id]} stepKey={stepKey} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
};
