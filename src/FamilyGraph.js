import { useMemo } from 'react';
import './FamilyGraph.css';

const NODE_WIDTH = 110;
const NODE_GAP = 16;
const NODE_HEIGHT = 92;
const ROW_GAP = 80;
const GRAPH_MARGIN = 8;
const GRAPH_TOP = 40;

function getMemberName(member) {
  return `${member.firstName} ${member.lastName || ''}`.trim();
}

function getRelationshipOrder(member) {
  const relationship = (member.relationship || '').toLocaleLowerCase();
  if (relationship === 'self') return 0;
  if (
    ['sibling', 'brother', 'sister', 'brother-in-law', 'sister-in-law'].includes(
      relationship
    )
  ) {
    return 1;
  }
  if (relationship === 'spouse') return 2;
  return 3;
}

function getParentBranchOrder(members) {
  const relationships = new Set(
    members.map((member) => (member.relationship || '').toLocaleLowerCase())
  );
  if (relationships.has('spouse')) return 0;
  if (relationships.has('self')) return 1;
  return 2;
}

function compareParentIds(firstIds, secondIds) {
  const sharedLength = Math.min(firstIds.length, secondIds.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (firstIds[index] !== secondIds[index]) {
      return firstIds[index] - secondIds[index];
    }
  }
  return firstIds.length - secondIds.length;
}

function createFamilyGraph(members) {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const rootById = new Map(members.map((member) => [member.id, member.id]));

  function findRoot(memberId) {
    const rootId = rootById.get(memberId);
    if (rootId !== memberId) {
      rootById.set(memberId, findRoot(rootId));
    }
    return rootById.get(memberId);
  }

  function joinSpouses(firstId, secondId) {
    if (!rootById.has(firstId) || !rootById.has(secondId)) return;
    const firstRoot = findRoot(firstId);
    const secondRoot = findRoot(secondId);
    if (firstRoot !== secondRoot) rootById.set(secondRoot, firstRoot);
  }

  members.forEach((member) => {
    (member.spouseIds || []).forEach((spouseId) => joinSpouses(member.id, spouseId));
  });

  const unitsById = new Map();
  const unitIdByMemberId = new Map();
  members.forEach((member) => {
    const unitId = findRoot(member.id);
    unitIdByMemberId.set(member.id, unitId);
    if (!unitsById.has(unitId)) {
      unitsById.set(unitId, { id: unitId, members: [], parentUnitIds: new Set() });
    }
    unitsById.get(unitId).members.push(member);
  });

  const units = [...unitsById.values()];
  units.forEach((unit) => {
    unit.members.sort((first, second) =>
      getMemberName(first).localeCompare(getMemberName(second))
    );
    unit.members.forEach((member) => {
      (member.parentIds || []).forEach((parentId) => {
        const parentUnitId = unitIdByMemberId.get(parentId);
        if (parentUnitId !== undefined && parentUnitId !== unit.id) {
          unit.parentUnitIds.add(parentUnitId);
        }
      });
    });
  });

  const generationByUnitId = new Map();
  function getGeneration(unitId, visited = new Set()) {
    if (generationByUnitId.has(unitId)) return generationByUnitId.get(unitId);
    if (visited.has(unitId)) return 0;

    const nextVisited = new Set(visited);
    nextVisited.add(unitId);
    const unit = unitsById.get(unitId);
    const parentGenerations = [...unit.parentUnitIds].map((parentUnitId) =>
      getGeneration(parentUnitId, nextVisited)
    );
    const generation = parentGenerations.length
      ? Math.max(...parentGenerations) + 1
      : 0;
    generationByUnitId.set(unitId, generation);
    return generation;
  }

  const unitsByGeneration = new Map();
  units.forEach((unit) => {
    const generation = getGeneration(unit.id);
    if (!unitsByGeneration.has(generation)) unitsByGeneration.set(generation, []);
    unitsByGeneration.get(generation).push(unit);
  });

  const generationRows = [...unitsByGeneration.entries()]
    .sort(([first], [second]) => first - second)
    .map(([generation, rowUnits]) => ({
      generation,
      units: rowUnits,
      members: [],
      cardHeight: NODE_HEIGHT,
    }));

  const childBranchOrderByParentUnitId = new Map();
  const membersByParentKey = new Map();
  const getParentIds = (member) =>
    [...new Set(member.parentIds || [])].sort((a, b) => a - b);
  members.forEach((member) => {
    const parentIds = getParentIds(member);
    if (parentIds.length === 0) return;
    const parentKey = parentIds.join(',');
    if (!membersByParentKey.has(parentKey)) membersByParentKey.set(parentKey, []);
    membersByParentKey.get(parentKey).push(member);
  });
  const branchOrderByParentKey = new Map(
    [...membersByParentKey].map(([parentKey, branchMembers]) => [
      parentKey,
      getParentBranchOrder(branchMembers),
    ])
  );
  membersByParentKey.forEach((branchMembers, parentKey) => {
    const branchOrder = branchOrderByParentKey.get(parentKey);
    const parentUnitIds = new Set(
      parentKey
        .split(',')
        .map(Number)
        .map((parentId) => unitIdByMemberId.get(parentId))
        .filter((unitId) => unitId !== undefined)
    );
    parentUnitIds.forEach((parentUnitId) => {
      const currentOrder = childBranchOrderByParentUnitId.get(parentUnitId);
      if (currentOrder === undefined || branchOrder < currentOrder) {
        childBranchOrderByParentUnitId.set(parentUnitId, branchOrder);
      }
    });
  });

  const compareMembersByBranch = (first, second) => {
    const firstParentIds = getParentIds(first);
    const secondParentIds = getParentIds(second);
    const firstBranchOrder =
      branchOrderByParentKey.get(firstParentIds.join(',')) ?? 2;
    const secondBranchOrder =
      branchOrderByParentKey.get(secondParentIds.join(',')) ?? 2;
    if (firstBranchOrder !== secondBranchOrder) {
      return firstBranchOrder - secondBranchOrder;
    }
    const parentDifference = compareParentIds(firstParentIds, secondParentIds);
    if (parentDifference !== 0) return parentDifference;
    const relationshipDifference =
      getRelationshipOrder(first) - getRelationshipOrder(second);
    if (relationshipDifference !== 0) return relationshipDifference;
    return getMemberName(first).localeCompare(getMemberName(second));
  };
  const getUnitAnchor = (unit) =>
    unit.members
      .filter((member) => getParentIds(member).some((id) => memberById.has(id)))
      .sort(compareMembersByBranch)[0];
  const compareUnits = (first, second) => {
    const firstAnchor = getUnitAnchor(first);
    const secondAnchor = getUnitAnchor(second);
    if (firstAnchor && secondAnchor) {
      return compareMembersByBranch(firstAnchor, secondAnchor) || first.id - second.id;
    }
    if (firstAnchor) return -1;
    if (secondAnchor) return 1;
    const branchDifference =
      (childBranchOrderByParentUnitId.get(first.id) ?? 2) -
      (childBranchOrderByParentUnitId.get(second.id) ?? 2);
    return branchDifference || first.id - second.id;
  };
  const compareMembersInUnit = (first, second) => {
    const firstHasParents = getParentIds(first).some((id) => memberById.has(id));
    const secondHasParents = getParentIds(second).some((id) => memberById.has(id));
    if (firstHasParents !== secondHasParents) {
      return firstHasParents ? -1 : 1;
    }
    return firstHasParents
      ? compareMembersByBranch(first, second)
      : getMemberName(first).localeCompare(getMemberName(second));
  };

  const childrenByParentUnitId = new Map();
  members.forEach((member) => {
    const childUnitId = unitIdByMemberId.get(member.id);
    const parentUnitIds = new Set(
      getParentIds(member)
        .map((parentId) => unitIdByMemberId.get(parentId))
        .filter((parentUnitId) => parentUnitId !== undefined && parentUnitId !== childUnitId)
    );
    parentUnitIds.forEach((parentUnitId) => {
      if (!childrenByParentUnitId.has(parentUnitId)) {
        childrenByParentUnitId.set(parentUnitId, new Set());
      }
      childrenByParentUnitId.get(parentUnitId).add(member.id);
    });
  });

  let nextTop = GRAPH_TOP;
  const memberPositions = new Map();
  const unitLeftById = new Map();
  const unitWidth = (unit) =>
    unit.members.length * NODE_WIDTH + (unit.members.length - 1) * NODE_GAP;
  const placeUnit = (unit, left, top) => {
    unitLeftById.set(unit.id, left);
    unit.members.forEach((member, index) => {
      const memberLeft = left + index * (NODE_WIDTH + NODE_GAP);
      memberPositions.set(member.id, {
        left: memberLeft,
        top,
        centerX: memberLeft + NODE_WIDTH / 2,
        cardHeight: NODE_HEIGHT,
      });
    });
  };
  const updateRowWidth = (row) => {
    row.width = Math.max(
      GRAPH_MARGIN * 2 + NODE_WIDTH,
      ...row.members.map(
        (member) => memberPositions.get(member.id).left + NODE_WIDTH + GRAPH_MARGIN
      )
    );
  };

  generationRows.forEach((row) => {
    row.units.sort(compareUnits);
    row.units.forEach((unit) => {
      unit.members.sort(compareMembersInUnit);
      row.members.push(...unit.members);
    });

    row.top = nextTop;
    let nextLeft = GRAPH_MARGIN;
    row.units.forEach((unit) => {
      placeUnit(unit, nextLeft, row.top);
      nextLeft += unitWidth(unit) + NODE_GAP;
    });
    updateRowWidth(row);
    nextTop += row.cardHeight + ROW_GAP;
  });

  for (let rowIndex = generationRows.length - 2; rowIndex >= 0; rowIndex -= 1) {
    const row = generationRows[rowIndex];
    const placements = row.units
      .map((unit, index) => {
        const childCenters = [...(childrenByParentUnitId.get(unit.id) || [])]
          .map((childId) => memberPositions.get(childId)?.centerX)
          .filter((centerX) => centerX !== undefined);
        const desiredLeft = childCenters.length
          ? childCenters.reduce((total, centerX) => total + centerX, 0) /
              childCenters.length -
            unitWidth(unit) / 2
          : unitLeftById.get(unit.id);
        return { unit, desiredLeft, index };
      })
      .sort(
        (first, second) =>
          first.desiredLeft - second.desiredLeft || first.index - second.index
      );

    let nextLeft = GRAPH_MARGIN;
    row.units = placements.map(({ unit, desiredLeft }) => {
      const left = Math.max(GRAPH_MARGIN, desiredLeft, nextLeft);
      placeUnit(unit, left, row.top);
      nextLeft = left + unitWidth(unit) + NODE_GAP;
      return unit;
    });
    row.members = row.units.flatMap((unit) => unit.members);
    updateRowWidth(row);
  }

  const childrenByParentAndGeneration = new Map();
  members.forEach((member) => {
    const childUnitId = unitIdByMemberId.get(member.id);
    const generation = generationByUnitId.get(childUnitId);
    const parentIds = [...new Set(member.parentIds || [])]
      .filter(
        (parentId) =>
          memberById.has(parentId) &&
          unitIdByMemberId.get(parentId) !== childUnitId
      )
      .sort((first, second) => first - second);
    if (parentIds.length === 0) return;

    const groupKey = `${parentIds.join(',')}:${generation}`;
    if (!childrenByParentAndGeneration.has(groupKey)) {
      childrenByParentAndGeneration.set(groupKey, {
        parentIds,
        generation,
        childMemberIds: [],
      });
    }
    childrenByParentAndGeneration.get(groupKey).childMemberIds.push(member.id);
  });

  const childGroups = [...childrenByParentAndGeneration.values()];
  const childGroupCounts = new Map();
  childGroups.forEach(({ generation }) => {
    childGroupCounts.set(generation, (childGroupCounts.get(generation) || 0) + 1);
  });
  const childGroupIndices = new Map();
  const edges = childGroups.flatMap(
    ({ parentIds, generation, childMemberIds }) => {
      const childPositions = childMemberIds
        .map((childMemberId) => memberPositions.get(childMemberId))
        .sort((first, second) => first.left - second.left);
      const groupIndex = childGroupIndices.get(generation) || 0;
      childGroupIndices.set(generation, groupIndex + 1);
      const branchRatio =
        (groupIndex + 1) / (childGroupCounts.get(generation) + 1);
      const parentUnitIds = new Set(
        parentIds.map((parentId) => unitIdByMemberId.get(parentId))
      );
      const sources =
        parentIds.length > 1 && parentUnitIds.size === 1
          ? (() => {
              const parentPositions = parentIds
                .map((parentId) => memberPositions.get(parentId))
                .filter(Boolean);
              return [
                {
                  id: `unit-${parentUnitIds.values().next().value}`,
                  position: {
                    centerX:
                      parentPositions.reduce(
                        (total, position) => total + position.centerX,
                        0
                      ) / parentPositions.length,
                    top: parentPositions[0].top,
                    cardHeight: parentPositions[0].cardHeight,
                  },
                },
              ];
            })()
          : parentIds.map((parentId) => ({
              id: `member-${parentId}`,
              position: memberPositions.get(parentId),
            }));

      return sources.map(({ id, position }) => {
        const fromX = position.centerX;
        const fromY = position.top + position.cardHeight;
        const toY = childPositions[0].top;
        const branchY = fromY + (toY - fromY) * branchRatio;
        if (childPositions.length === 1) {
          const toX = childPositions[0].centerX;
          return {
            id: `${id}-${childMemberIds[0]}-${generation}`,
            path: `M ${fromX} ${fromY} C ${fromX} ${branchY}, ${toX} ${branchY}, ${toX} ${toY}`,
          };
        }

        const firstChildX = childPositions[0].centerX;
        const lastChildX = childPositions[childPositions.length - 1].centerX;
        const branchStartX = Math.min(fromX, firstChildX);
        const branchEndX = Math.max(fromX, lastChildX);
        const drops = childPositions
          .map((childPosition) => `M ${childPosition.centerX} ${branchY} V ${childPosition.top}`)
          .join(' ');
        return {
          id: `${id}-${generation}`,
          path: `M ${fromX} ${fromY} V ${branchY} H ${branchStartX} H ${branchEndX} ${drops}`,
        };
      });
    }
  );

  const spouseEdges = [];
  members.forEach((member) => {
    (member.spouseIds || []).forEach((spouseId) => {
      if (member.id >= spouseId) return;
      const firstPosition = memberPositions.get(member.id);
      const secondPosition = memberPositions.get(spouseId);
      if (!firstPosition || !secondPosition) return;

      const leftPosition =
        firstPosition.left < secondPosition.left ? firstPosition : secondPosition;
      const rightPosition =
        leftPosition === firstPosition ? secondPosition : firstPosition;
      spouseEdges.push({
        id: `${member.id}-${spouseId}`,
        path: `M ${leftPosition.left + NODE_WIDTH} ${
          leftPosition.top + NODE_HEIGHT / 2
        } H ${rightPosition.left}`,
      });
    });
  });

  return {
    edges,
    memberPositions,
    spouseEdges,
    hasConnections: members.some(
      (member) =>
        (member.parentIds || []).some((id) => memberById.has(id)) ||
        (member.spouseIds || []).some((id) => memberById.has(id))
    ),
    height: Math.max(170, nextTop - ROW_GAP + GRAPH_TOP),
    rows: generationRows,
    width: Math.max(
      GRAPH_MARGIN * 2 + NODE_WIDTH,
      ...generationRows.map((row) => row.width)
    ),
  };
}

function FamilyGraph({ members, isLoading, isLoadError, onRetry, onManageMembers }) {
  const graph = useMemo(() => createFamilyGraph(members), [members]);

  return (
    <section className="family-graph-page page-content" aria-labelledby="family-graph-title">
      <header className="family-graph-header">
        <div>
          <span className="eyebrow">YOUR FAMILY, ACROSS GENERATIONS</span>
          <h1 id="family-graph-title">Family graph</h1>
          <p>Connect parents and spouses from a member’s edit form to build your tree.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onManageMembers}>
          Manage members
        </button>
      </header>

      {isLoading ? (
        <div className="family-graph-state" role="status">Loading your family graph…</div>
      ) : isLoadError ? (
        <div className="family-graph-state" role="alert">
          <p>Your family graph is unavailable because family members could not be loaded.</p>
          <button className="retry-button" type="button" onClick={onRetry}>Retry</button>
        </div>
      ) : members.length === 0 ? (
        <div className="family-graph-state">
          <h2>Add family members to begin</h2>
          <p>Your graph will appear here after you add people to your family space.</p>
          <button className="primary-button" type="button" onClick={onManageMembers}>
            Go to family members
          </button>
        </div>
      ) : (
        <section className="family-graph-panel" aria-label="Family relationships">
          <div className="family-graph-legend">
            <span className="family-graph-legend-parent" aria-hidden="true" />
            <span>Parent to child</span>
            <span className="family-graph-legend-spouse" aria-hidden="true" />
            <span>Spouse</span>
          </div>
          {!graph.hasConnections && (
            <p className="family-graph-hint">
              No parent or spouse links yet. Edit a family member to connect people and add
              generations.
            </p>
          )}
          <p className="family-graph-guidance">
            Siblings share a parent branch. Edit each sibling and select the same parent(s);
            relationship labels alone do not connect people. Use Spouse(s) to connect a
            sibling’s partner.
          </p>
          <p className="family-graph-scroll-hint">
            Scroll horizontally on smaller screens to see the full family graph.
          </p>
          <div
            className="family-graph-scroll"
            role="group"
            aria-label="Family members arranged by generation"
          >
            <div
              className="family-graph-canvas"
              style={{ height: `${graph.height}px` }}
            >
              <div
                className="family-graph-content"
                style={{
                  width: `${graph.width}px`,
                  height: `${graph.height}px`,
                }}
              >
                <svg
                  className="family-graph-edges"
                  width={graph.width}
                  height={graph.height}
                  viewBox={`0 0 ${graph.width} ${graph.height}`}
                  role="img"
                  aria-label="Parent, child, and spouse connections"
                >
                  {graph.edges.map((edge) => (
                    <path
                      className="family-graph-parent-edge"
                      key={`parent-${edge.id}`}
                      d={edge.path}
                    />
                  ))}
                  {graph.spouseEdges.map((edge) => (
                    <path
                      className="family-graph-spouse-edge"
                      key={`spouse-${edge.id}`}
                      d={edge.path}
                    />
                  ))}
                </svg>
                {graph.rows.map((row) => (
                  <section
                    className="family-graph-generation"
                    key={row.generation}
                    aria-labelledby={`generation-${row.generation}`}
                    style={{ top: `${row.top}px` }}
                  >
                    <h2 id={`generation-${row.generation}`}>
                      Generation {row.generation + 1}
                    </h2>
                    {row.members.map((member) => {
                      const position = graph.memberPositions.get(member.id);
                      return (
                        <article
                          className="family-graph-member-node"
                          key={member.id}
                          style={{
                            left: `${position.left}px`,
                            height: `${position.cardHeight}px`,
                          }}
                        >
                          <strong>{getMemberName(member)}</strong>
                          <span>{member.relationship || 'Family member'}</span>
                        </article>
                      );
                    })}
                  </section>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

export default FamilyGraph;
