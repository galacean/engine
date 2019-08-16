import { Node } from '../src/Node.js';

describe("Node", ()=>{
  describe("Node worked!", ()=>{
    let node = new Node();
    it("constructor()", ()=>{
      expect(node).is.instanceof(Node);
      expect(node.position).is.instanceof(Float32Array);
      expect(node.position.length).is.equal(3);
      expect(node.rotation).is.instanceof(Float32Array);
      expect(node.rotation.length).is.equal(4);
      expect(node.scale).is.instanceof(Float32Array);
      expect(node.scale.length).is.equal(3);
      expect(node.getModelMatrix()).is.instanceof(Float32Array);
      expect(node.getModelMatrix().length).is.equal(16);
      expect(node.getInvModelMatrix()).is.instanceof(Float32Array);
      expect(node.getInvModelMatrix().length).is.equal(16);
    });

    it("createChild()", ()=>{
      let son = node.createChild("son");
      expect(son).is.instanceof(Node);
      expect(son.name).is.equal("son");
      expect(son.parentNode).is.equal(node);
      let grandson = son.createChild("grandson");
      expect(grandson).is.instanceof(Node);
      expect(grandson.name).is.equal("grandson");
      expect(grandson.parentNode).is.equal(son);
    });

    it("findChildByName()", ()=>{
      let son = node.findChildByName("son");
      expect(son.name).is.equal("son");
      let grandson = node.findChildByName("grandson");
      expect(grandson.name).is.equal("grandson");
    });

    it("findChildByPath()", ()=>{
      let son = node.findChildByPath("son");
      expect(son.name).is.equal("son");
      let grandson = node.findChildByPath("son/grandson");
      expect(grandson.name).is.equal("grandson");
    });

    it("destroy()", ()=>{
      let son = node.findChildByName("son");
      let grandson = node.findChildByName("grandson");
      node.destroy();
      expect(node.isPendingDestroy).is.true;
      expect(son.isPendingDestroy).is.true;
      expect(grandson.isPendingDestroy).is.true;
    });
  });


  describe("isActiveInHierarchy", ()=>{
    let scene = {};
    let nodeRoot = new Node(scene);
      let layer11 = new Node(scene, nodeRoot);
        let layer211 = new Node(scene, layer11);
        let layer212 = new Node(scene, layer11);
        let layer213 = new Node(scene, layer11);
      let layer12 = new Node(scene, nodeRoot);
        let layer221 = new Node(scene, layer12);
        let layer222 = new Node(scene, layer12);
      let layer13 = new Node(scene, nodeRoot);
        let layer231 = new Node(scene, layer13);
        let layer232 = new Node(scene, layer13);


    it("isActiveInHierarchy initial", ()=>{
      expect(nodeRoot.isActiveInHierarchy).is.true;
        expect(layer11.isActiveInHierarchy).is.true;
          expect(layer211.isActiveInHierarchy).is.true;
          expect(layer212.isActiveInHierarchy).is.true;
          expect(layer213.isActiveInHierarchy).is.true;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer221.isActiveInHierarchy).is.true;
          expect(layer222.isActiveInHierarchy).is.true;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer231.isActiveInHierarchy).is.true;
          expect(layer232.isActiveInHierarchy).is.true;
    });

    it("isActiveInHierarchy leaf", ()=>{
      layer232.isActive = false;
      layer222.isActive = false;
      expect(nodeRoot.isActiveInHierarchy).is.true;
        expect(layer11.isActiveInHierarchy).is.true;
          expect(layer211.isActiveInHierarchy).is.true;
          expect(layer212.isActiveInHierarchy).is.true;
          expect(layer213.isActiveInHierarchy).is.true;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer221.isActiveInHierarchy).is.true;
          expect(layer222.isActiveInHierarchy).is.false;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer231.isActiveInHierarchy).is.true;
          expect(layer232.isActiveInHierarchy).is.false;
    });

    it("isActiveInHierarchy middle", ()=>{
      layer11.isActive = false;
      expect(nodeRoot.isActiveInHierarchy).is.true;
        expect(layer11.isActiveInHierarchy).is.false;
          expect(layer211.isActiveInHierarchy).is.false;
          expect(layer212.isActiveInHierarchy).is.false;
          expect(layer213.isActiveInHierarchy).is.false;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer221.isActiveInHierarchy).is.true;
          expect(layer222.isActiveInHierarchy).is.false;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer231.isActiveInHierarchy).is.true;
          expect(layer232.isActiveInHierarchy).is.false;
    });

    it("isActiveInHierarchy change", ()=>{
      layer211.parentNode = layer12;
      expect(nodeRoot.isActiveInHierarchy).is.true;
        expect(layer11.isActiveInHierarchy).is.false;
          expect(layer212.isActiveInHierarchy).is.false;
          expect(layer213.isActiveInHierarchy).is.false;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer221.isActiveInHierarchy).is.true;
          expect(layer222.isActiveInHierarchy).is.false;
          expect(layer211.isActiveInHierarchy).is.true;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer231.isActiveInHierarchy).is.true;
          expect(layer232.isActiveInHierarchy).is.false;
    });


    it("isActiveInHierarchy root false", ()=>{
      nodeRoot.isActive = false;
      expect(nodeRoot.isActiveInHierarchy).is.false;
        expect(layer11.isActiveInHierarchy).is.false;
          expect(layer212.isActiveInHierarchy).is.false;
          expect(layer213.isActiveInHierarchy).is.false;
        expect(layer12.isActiveInHierarchy).is.false;
          expect(layer221.isActiveInHierarchy).is.false;
          expect(layer222.isActiveInHierarchy).is.false;
          expect(layer211.isActiveInHierarchy).is.false;
        expect(layer12.isActiveInHierarchy).is.false;
          expect(layer231.isActiveInHierarchy).is.false;
          expect(layer232.isActiveInHierarchy).is.false;
    });

    it("isActiveInHierarchy root true once more", ()=>{
      nodeRoot.isActive = true;
      expect(nodeRoot.isActiveInHierarchy).is.true;
        expect(layer11.isActiveInHierarchy).is.false;
          expect(layer212.isActiveInHierarchy).is.false;
          expect(layer213.isActiveInHierarchy).is.false;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer221.isActiveInHierarchy).is.true;
          expect(layer222.isActiveInHierarchy).is.false;
          expect(layer211.isActiveInHierarchy).is.true;
        expect(layer12.isActiveInHierarchy).is.true;
          expect(layer231.isActiveInHierarchy).is.true;
          expect(layer232.isActiveInHierarchy).is.false;
    });
  });

});