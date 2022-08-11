import * as THREE from "three";
import React, { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations, PositionalAudio } from "@react-three/drei";
import { GLTF } from "three-stdlib";
import { Group, LoopRepeat, Spherical, Vector2, Vector3 } from "three";
import {
  angleToMathPiRange,
  closeMouth,
  openMouth,
  rotateBones,
  setHeadHeight,
  useBones,
} from "./logic/bones";
import { useFrame } from "@react-three/fiber";
import { PositionalAudio as PositionalAudioImpl } from "three/src/audio/PositionalAudio";
import { useLimitedFrame } from "spacesvr";
import { useMind } from "../../layers/Mind";

type ActionName =
  | "attack"
  | "die"
  | "eat"
  | "hit"
  | "idle"
  | "run"
  | "sleep"
  | "sleep_end"
  | "sleep_start"
  | "swim"
  | "walk";

interface GLTFAction extends THREE.AnimationClip {
  name: ActionName;
}

type GLTFResult = GLTF & {
  nodes: {
    goose_1: THREE.SkinnedMesh;
    goose_2: THREE.SkinnedMesh;
    goose_3: THREE.SkinnedMesh;
    Bone: THREE.Bone;
  };
  materials: {
    fur: THREE.MeshStandardMaterial;
    beak: THREE.MeshStandardMaterial;
    eye: THREE.MeshStandardMaterial;
  };
  animations: GLTFAction[];
};

const CONTENT_LIBRARY = "https://d27rt3a60hh1lx.cloudfront.net/content/goose";
const HONK_FILE = `${CONTENT_LIBRARY}/honk-sound.mp3`;

const FILE_URL =
  "https://d27rt3a60hh1lx.cloudfront.net/models/Goose-1660227654/goose_03.glb.gz";

const HEAD_OFFSET = new THREE.Vector3(0, 0.705, 0.15);
const HEAD_RANGE = Math.PI / 2 - 0.2;

type GooseModelProps = {
  walking?: boolean;
};

export default function GooseModel(props: GooseModelProps) {
  const { walking } = props;

  const group = useRef<Group>(null);
  const gltf = useGLTF(FILE_URL) as GLTFResult;
  const { nodes, materials, animations, scene } = gltf;
  const { actions } = useAnimations(animations, group);
  const honkAudio = useRef<PositionalAudioImpl>();
  const mind = useMind();

  const bones = useBones(nodes.Bone);

  useEffect(() => {
    scene.traverse((child) => {
      child.frustumCulled = false;
    });
  }, [scene]);

  useEffect(() => {
    if (!actions.walk || !actions.idle) return;
    actions.walk.loop = LoopRepeat;
    actions.idle.loop = LoopRepeat;
    if (walking) {
      actions.idle.fadeOut(0.4);
      actions.walk.reset().fadeIn(0.4).play().setEffectiveTimeScale(2);
    } else {
      actions.walk.fadeOut(0.4);
      actions.idle.reset().fadeIn(0.4).play();
    }
  }, [walking]);

  const pos = useMemo(() => new Vector3(), []);
  const spher = useMemo(() => new Spherical(), []);
  const rot = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    if (!bones || !group.current) return;
    group.current.getWorldPosition(pos);
    group.current.getWorldDirection(rot);

    const head_off = HEAD_OFFSET.clone().applyQuaternion(
      group.current.quaternion
    );
    const posOffset = pos.add(head_off).sub(camera.position);
    const dist = new Vector2(posOffset.x, posOffset.z).length();
    const heightAngle = Math.atan2(posOffset.y, dist) - Math.PI / 2;

    const offsetAngle = spher.setFromCartesianCoords(
      -posOffset.x,
      0,
      -posOffset.z
    ).theta;
    const originalAngle = spher.setFromCartesianCoords(rot.x, 0, rot.z).theta;
    const angle = offsetAngle - originalAngle;

    if (
      Math.abs(angleToMathPiRange(angle)) <= HEAD_RANGE &&
      posOffset.length() < 6
    ) {
      mind.sendSignal("playerInSight");
      rotateBones(bones, angle);
      setHeadHeight(bones, heightAngle);
    } else {
      mind.sendSignal("playerLost");
      rotateBones(bones, 0);
      setHeadHeight(bones, -Math.PI / 2);
    }

    if (honkAudio.current?.isPlaying) {
      openMouth(bones);
    } else {
      closeMouth(bones);
    }
  });

  useLimitedFrame(1.3, () => {
    if (!honkAudio.current) return;
    if (Math.random() < 0.065) {
      honkAudio.current.setVolume(0.8 + Math.random() * 0.4);
      honkAudio.current.play();
    }
  });

  return (
    <group ref={group} {...props}>
      <PositionalAudio
        ref={honkAudio}
        url={HONK_FILE}
        loop={false}
        autoplay={false}
      />
      <group name="Scene" scale={0.15}>
        <group name="goose_armature">
          <primitive object={nodes.Bone} />
          <group name="goose">
            <skinnedMesh
              name="goose_1"
              geometry={nodes.goose_1.geometry}
              material={materials.fur}
              skeleton={nodes.goose_1.skeleton}
            />
            <skinnedMesh
              name="goose_2"
              geometry={nodes.goose_2.geometry}
              material={materials.beak}
              skeleton={nodes.goose_2.skeleton}
            />
            <skinnedMesh
              name="goose_3"
              geometry={nodes.goose_3.geometry}
              material={materials.eye}
              skeleton={nodes.goose_3.skeleton}
            />
          </group>
        </group>
      </group>
    </group>
  );
}
