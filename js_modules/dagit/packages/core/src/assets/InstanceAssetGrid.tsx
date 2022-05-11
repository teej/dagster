import {
  Box,
  Button,
  Colors,
  FontFamily,
  Heading,
  Icon,
  PageHeader,
  SplitPanelContainer,
  Subheading,
  Table,
} from '@dagster-io/ui';
import flatMap from 'lodash/flatMap';
import uniqBy from 'lodash/uniqBy';
import * as React from 'react';
import {useParams} from 'react-router';
import {Link} from 'react-router-dom';

import {
  displayNameForAssetKey,
  GraphData,
  identifyBundles,
  tokenForAssetKey,
} from '../asset-graph/Utils';
import {useAssetGraphData} from '../asset-graph/useAssetGraphData';
import {useViewport} from '../gantt/useViewport';
import {
  instanceAssetsExplorerPathFromString,
  instanceAssetsExplorerPathToURL,
} from '../pipelines/PipelinePathUtils';
import {ReloadAllButton} from '../workspace/ReloadAllButton';

import {AssetViewModeSwitch} from './AssetViewModeSwitch';
import styled from 'styled-components/macro';
import {AssetNode} from '../asset-graph/AssetNode';
import {useLiveDataForAssetKeys} from '../asset-graph/useLiveDataForAssetKeys';
import {SidebarAssetInfo} from '../asset-graph/SidebarAssetInfo';
import {RightInfoPanel, RightInfoPanelContent} from '../pipelines/GraphExplorer';
import {AssetKey} from './types';

const PADDING = 30;

export const InstanceAssetGrid: React.FC = () => {
  const params = useParams();
  const explorerPath = instanceAssetsExplorerPathFromString(params[0]);
  const {assetGraphData} = useAssetGraphData(null, explorerPath.opsQuery || '*');

  return (
    <Box
      flex={{direction: 'column', justifyContent: 'stretch'}}
      style={{height: '100%', position: 'relative'}}
    >
      <PageHeader title={<Heading>Assets</Heading>} />
      <Box
        background={Colors.White}
        padding={{left: 24, right: 12, vertical: 8}}
        border={{side: 'bottom', width: 1, color: Colors.KeylineGray}}
        flex={{direction: 'row', gap: 12}}
      >
        <AssetViewModeSwitch />
        <div style={{flex: 1}} />
        <ReloadAllButton />
      </Box>
      <AssetGrid assetGraphData={assetGraphData} />
    </Box>
  );
};

interface Box {
  id: string;
  contentIds: string[];
  layout: {top: number; left: number; width: number; height: number};
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

const AssetGrid: React.FC<{
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
    unbundledAssetIds.map((id) => ({path: JSON.parse(id)})),
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
                  assetKey={{path: JSON.parse(selected)}}
                  liveData={liveDataByNode[selected]}
                />
              ) : (
                <SidebarAssetBundleInfo
                  bundleKey={{path: JSON.parse(selected)}}
                  assetGraphData={assetGraphData}
                  assetKeys={bundles[selected].map((p) => ({path: JSON.parse(p)}))}
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
        {displayNameForAssetKey({path: JSON.parse(id)})}
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
          opsQuery: `${tokenForAssetKey({path: JSON.parse(id)})}/`,
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
  assetKeys: AssetKey[];
}> = ({assetKeys, assetGraphData, bundleKey}) => {
  const {liveDataByNode} = useLiveDataForAssetKeys(null, assetGraphData, assetKeys);

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
      <Table>
        <thead>
          <tr>
            <th>Asset Key</th>
            <th style={{width: 80}}>Materialized</th>
            <th style={{width: 80}}>Latest Run</th>
          </tr>
        </thead>
        <tbody>
          {assetKeys.map((key) => (
            <tr>
              <td>
                <Icon name="asset" size={16} />
                {displayNameForAssetKey(key)}
              </td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
