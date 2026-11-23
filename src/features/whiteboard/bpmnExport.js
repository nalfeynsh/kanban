const NODE_TYPES = {
  start: 'startEvent',
  end: 'endEvent',
  intermediate: 'intermediateThrowEvent',
  task: 'task',
  userTask: 'userTask',
  serviceTask: 'serviceTask',
  gatewayX: 'exclusiveGateway',
  gatewayPlus: 'parallelGateway',
  gatewayO: 'inclusiveGateway',
  subprocess: 'subProcess',
  dataObject: 'dataObjectReference',
  annotation: 'textAnnotation',
};

const ID_PREFIX = {
  startEvent: 'StartEvent',
  endEvent: 'EndEvent',
  intermediateThrowEvent: 'IntermediateEvent',
  task: 'Task',
  userTask: 'UserTask',
  serviceTask: 'ServiceTask',
  exclusiveGateway: 'ExclusiveGateway',
  parallelGateway: 'ParallelGateway',
  inclusiveGateway: 'InclusiveGateway',
  subProcess: 'SubProcess',
  dataObjectReference: 'DataObjectReference',
  textAnnotation: 'TextAnnotation',
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function center(object) {
  return { x: object.x + object.width / 2, y: object.y + object.height / 2 };
}

function contains(container, object) {
  const point = center(object);
  return point.x >= container.x
    && point.x <= container.x + container.width
    && point.y >= container.y
    && point.y <= container.y + container.height;
}

function smallestContaining(containers, object) {
  return containers
    .filter((container) => contains(container, object))
    .sort((a, b) => a.width * a.height - b.width * b.height)[0] || null;
}

function nodeKey(object) {
  return object.data?.bpmnType || 'task';
}

export function buildBpmnXml(objects = [], { name = 'BPMN-диаграмма' } = {}) {
  const bpmnObjects = objects.filter((item) => item.type === 'bpmn');
  const pools = bpmnObjects.filter((item) => nodeKey(item) === 'pool');
  const lanes = bpmnObjects.filter((item) => nodeKey(item) === 'lane');
  const nodes = bpmnObjects.filter((item) => NODE_TYPES[nodeKey(item)]);
  const connectors = objects.filter((item) => item.type === 'connector');
  const issues = [];

  const poolProcess = new Map();
  const poolParticipant = new Map();
  pools.forEach((pool, index) => {
    poolProcess.set(pool.id, `Process_${index + 1}`);
    poolParticipant.set(pool.id, `Participant_${index + 1}`);
  });

  const lanePool = new Map();
  const laneIds = new Map();
  lanes.forEach((lane, index) => {
    const pool = smallestContaining(pools, lane);
    laneIds.set(lane.id, `Lane_${index + 1}`);
    if (!pool) {
      issues.push({ level: 'warning', message: `Дорожка «${lane.data?.text || 'без названия'}» не находится внутри пула.` });
    } else {
      lanePool.set(lane.id, pool.id);
    }
  });

  const nodePool = new Map();
  const nodeLane = new Map();
  nodes.forEach((node) => {
    const lane = smallestContaining(lanes, node);
    const pool = smallestContaining(pools, node);
    nodeLane.set(node.id, lane?.id || null);
    nodePool.set(node.id, pool?.id || (lane ? lanePool.get(lane.id) : null) || null);
    if (pools.length > 0 && !pool && !lane) {
      issues.push({ level: 'warning', message: `Элемент «${node.data?.text || 'без названия'}» находится вне пула.` });
    }
  });

  const defaultProcess = 'Process_default';
  const processNodes = new Map();
  const ensureProcess = (processId) => {
    if (!processNodes.has(processId)) processNodes.set(processId, []);
    return processNodes.get(processId);
  };
  pools.forEach((pool) => ensureProcess(poolProcess.get(pool.id)));
  nodes.forEach((node) => {
    const processId = nodePool.get(node.id) ? poolProcess.get(nodePool.get(node.id)) : defaultProcess;
    ensureProcess(processId).push(node);
  });

  const ids = new Map();
  const counters = new Map();
  const nextId = (prefix) => {
    const value = (counters.get(prefix) || 0) + 1;
    counters.set(prefix, value);
    return `${prefix}_${value}`;
  };
  nodes.forEach((node) => {
    const type = NODE_TYPES[nodeKey(node)];
    const id = nextId(ID_PREFIX[type] || 'FlowNode');
    ids.set(node.id, id);
    if (type === 'dataObjectReference') {
      // dataObject живёт рядом со ссылкой
      ids.set(`${node.id}__data`, `${id}_data`);
    }
  });

  const participantFlow = new Map();
  nodes.forEach((node) => {
    if (nodeKey(node) === 'annotation') return;
    const elementId = ids.get(node.id);
    const laneId = nodeLane.get(node.id);
    if (laneId) {
      if (!participantFlow.has(laneId)) participantFlow.set(laneId, []);
      participantFlow.get(laneId).push(elementId);
    }
  });

  const sequenceByProcess = new Map();
  const messageFlows = [];
  if (nodes.length === 0) {
    issues.push({ level: 'error', message: 'На доске нет BPMN-элементов для экспорта.' });
  }
  connectors.forEach((connector) => {    const from = objects.find((item) => item.id === connector.data?.from);
    const to = objects.find((item) => item.id === connector.data?.to);
    if (!from || !to) {
      issues.push({ level: 'warning', message: 'Связь ссылается на удалённый элемент и пропущена.' });
      return;
    }
    const fromIsNode = Boolean(ids.get(from.id));
    const toIsNode = Boolean(ids.get(to.id));
    if (!fromIsNode || !toIsNode) {
      issues.push({ level: 'error', message: 'Связь должна соединять элементы процесса, а не пул или дорожку.' });
      return;
    }
    if (nodeKey(from) === 'annotation' || nodeKey(to) === 'annotation') {
      issues.push({ level: 'warning', message: 'Связь с комментарием не экспортируется как поток процесса.' });
      return;
    }
    const fromProcess = nodePool.get(from.id) ? poolProcess.get(nodePool.get(from.id)) : defaultProcess;
    const toProcess = nodePool.get(to.id) ? poolProcess.get(nodePool.get(to.id)) : defaultProcess;
    const flowId = nextId(fromProcess === toProcess ? 'SequenceFlow' : 'MessageFlow');
    if (fromProcess === toProcess) {
      if (!sequenceByProcess.has(fromProcess)) sequenceByProcess.set(fromProcess, []);
      sequenceByProcess.get(fromProcess).push({
        id: flowId,
        sourceRef: ids.get(from.id),
        targetRef: ids.get(to.id),
        label: connector.data?.label || '',
      });
    } else {
      messageFlows.push({
        id: flowId,
        sourceRef: ids.get(from.id),
        targetRef: ids.get(to.id),
        label: connector.data?.label || '',
      });
    }
  });

  processNodes.forEach((items, processId) => {
    if (items.length === 0) return;
    if (!items.some((node) => nodeKey(node) === 'start')) {
      issues.push({ level: 'warning', message: `В процессе ${processId} нет стартового события.` });
    }
    if (!items.some((node) => nodeKey(node) === 'end')) {
      issues.push({ level: 'warning', message: `В процессе ${processId} нет конечного события.` });
    }
    const outgoing = new Map();
    (sequenceByProcess.get(processId) || []).forEach((flow) => {
      outgoing.set(flow.sourceRef, (outgoing.get(flow.sourceRef) || 0) + 1);
    });
    items.filter((node) => nodeKey(node).startsWith('gateway')).forEach((node) => {
      const elementId = ids.get(node.id);
      if ((outgoing.get(elementId) || 0) < 2) {
        issues.push({ level: 'warning', message: `У развилки «${node.data?.text || 'без названия'}» меньше двух исходящих связей.` });
      }
    });
  });

  const hasCollaboration = pools.length > 0 || messageFlows.length > 0;
  const collaborationId = 'Collaboration_1';
  const xml = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="https://kanban.layero.app/bpmn" exporter="Мой Канбан">');
  xml.push(`  <bpmn:documentation>${esc(name)}</bpmn:documentation>`);
  if (hasCollaboration) {
    xml.push(`  <bpmn:collaboration id="${collaborationId}">`);
    pools.forEach((pool) => {
      xml.push(`    <bpmn:participant id="${poolParticipant.get(pool.id)}" name="${esc(pool.data?.text || 'Пул')}" processRef="${poolProcess.get(pool.id)}" />`);
    });
    messageFlows.forEach((flow) => {
      xml.push(`    <bpmn:messageFlow id="${flow.id}" name="${esc(flow.label)}" sourceRef="${flow.sourceRef}" targetRef="${flow.targetRef}" />`);
    });
    xml.push('  </bpmn:collaboration>');
  }

  processNodes.forEach((items, processId) => {
    xml.push(`  <bpmn:process id="${processId}" isExecutable="false">`);
    if (pools.length > 0 && processId !== defaultProcess) {
      const pool = pools.find((item) => poolProcess.get(item.id) === processId);
      const processLanes = lanes.filter((lane) => lanePool.get(lane.id) === pool?.id);      if (processLanes.length > 0) {
        xml.push(`    <bpmn:laneSet id="LaneSet_${processId}">`);
        processLanes.forEach((lane) => {
          xml.push(`      <bpmn:lane id="${laneIds.get(lane.id)}" name="${esc(lane.data?.text || 'Дорожка')}">`);
          (participantFlow.get(lane.id) || []).forEach((ref) => xml.push(`        <bpmn:flowNodeRef>${ref}</bpmn:flowNodeRef>`));
          xml.push('      </bpmn:lane>');
        });
        xml.push('    </bpmn:laneSet>');
      }
    }
    const flowItems = items.filter((node) => nodeKey(node) !== 'annotation');
    const annotationItems = items.filter((node) => nodeKey(node) === 'annotation');
    flowItems.forEach((node) => {
      const type = NODE_TYPES[nodeKey(node)];
      const id = ids.get(node.id);
      const label = node.data?.text || '';
      if (type === 'dataObjectReference') {
        xml.push(`    <bpmn:dataObject id="${ids.get(`${node.id}__data`)}" />`);
        xml.push(`    <bpmn:dataObjectReference id="${id}" name="${esc(label)}" dataObjectRef="${ids.get(`${node.id}__data`)}" />`);
        return;
      }
      xml.push(`    <bpmn:${type} id="${id}" name="${esc(label)}" />`);
    });
    annotationItems.forEach((node) => {
      const id = ids.get(node.id);
      const label = node.data?.text || '';
      xml.push(`    <bpmn:textAnnotation id="${id}">`);
      xml.push(`      <bpmn:text>${esc(label)}</bpmn:text>`);
      xml.push('    </bpmn:textAnnotation>');
    });
    (sequenceByProcess.get(processId) || []).forEach((flow) => {
      xml.push(`    <bpmn:sequenceFlow id="${flow.id}" name="${esc(flow.label)}" sourceRef="${flow.sourceRef}" targetRef="${flow.targetRef}" />`);
    });
    (sequenceByProcess.get(processId) || []).forEach((flow) => {
      xml.push(`    <bpmn:sequenceFlow id="${flow.id}" name="${esc(flow.label)}" sourceRef="${flow.sourceRef}" targetRef="${flow.targetRef}" />`);
    });
    xml.push('  </bpmn:process>');
  });

  if (processNodes.size > 0) {
    xml.push(`  <bpmndi:BPMNDiagram id="BPMNDiagram_1">`);
    xml.push(`    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${hasCollaboration ? collaborationId : [...processNodes.keys()][0] || 'Process_default'}">`);
    pools.forEach((pool) => {
      xml.push(`      <bpmndi:BPMNShape id="${poolParticipant.get(pool.id)}_di" bpmnElement="${poolParticipant.get(pool.id)}" isHorizontal="true">`);
      xml.push(`        <dc:Bounds x="${Math.round(pool.x)}" y="${Math.round(pool.y)}" width="${Math.round(pool.width)}" height="${Math.round(pool.height)}" />`);
      xml.push('      </bpmndi:BPMNShape>');
    });
    lanes.filter((lane) => lanePool.has(lane.id)).forEach((lane) => {
      xml.push(`      <bpmndi:BPMNShape id="${laneIds.get(lane.id)}_di" bpmnElement="${laneIds.get(lane.id)}" isHorizontal="true">`);
      xml.push(`        <dc:Bounds x="${Math.round(lane.x)}" y="${Math.round(lane.y)}" width="${Math.round(lane.width)}" height="${Math.round(lane.height)}" />`);
      xml.push('      </bpmndi:BPMNShape>');
    });
    nodes.forEach((node) => {
      const id = ids.get(node.id);
      xml.push(`      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">`);
      xml.push(`        <dc:Bounds x="${Math.round(node.x)}" y="${Math.round(node.y)}" width="${Math.round(node.width)}" height="${Math.round(node.height)}" />`);
      xml.push('      </bpmndi:BPMNShape>');
    });
    [...(sequenceByProcess.values())].flat().concat(messageFlows).forEach((flow) => {
      const from = objects.find((item) => ids.get(item.id) === flow.sourceRef);
      const to = objects.find((item) => ids.get(item.id) === flow.targetRef);
      if (!from || !to) return;
      xml.push(`      <bpmndi:BPMNEdge id="${flow.id}_di" bpmnElement="${flow.id}">`);
      xml.push(`        <di:waypoint x="${Math.round(from.x + from.width)}" y="${Math.round(from.y + from.height / 2)}" />`);
      xml.push(`        <di:waypoint x="${Math.round(to.x)}" y="${Math.round(to.y + to.height / 2)}" />`);
      xml.push('      </bpmndi:BPMNEdge>');
    });
    xml.push('    </bpmndi:BPMNPlane>');
    xml.push('  </bpmndi:BPMNDiagram>');
  }
  xml.push('</bpmn:definitions>');

  return { xml: xml.join('\n'), issues };
}
